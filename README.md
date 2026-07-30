# PersonalPlate

Personalized recipe assistant for safer meal suggestions, ingredient substitutions, profile-aware guidance, and AI video-based fridge/kitchen recommendations.

> **Medical Disclaimer:** PersonalPlate provides general nutrition support and does not replace medical advice from doctors or registered dietitians.

## Features

- **Health Profiles** — Store allergies, medical conditions, medications, dietary restrictions, activity level, calorie/budget targets, and food preferences
- **Personalized Recipe Ranking** (primary) — Spoonacular candidates + Gemini ranking + optional USDA fill-in; expand for cooking steps; Save → History (`/api/recipes/recommend`, `GET /api/recipes/[id]`)
- **AI Meal Suggestions** (secondary) — Gemini-powered dish ideas from ingredients + profile (`/api/generate-recipes`)
- **Video Ingredient Detection** — Upload mp4/mov/webm kitchen or fridge video; Gemini detects ingredients, quantities, tools, and cooking method (`/api/ingredients/detect`)
- **Allergy-Safe Substitutions** — Detects unsafe ingredients and suggests alternatives
- **Virtual Fridge** — Persist pantry items and reuse them in recommendation flows
- **Recipe History** — Save recommended recipes and revisit them on `/history`
- **Secure Auth** — Supabase authentication with row-level security
- **Caching** — Redis when `REDIS_URL` is set; otherwise in-memory TTL cache for Spoonacular, USDA, and ranking results (not a full recommend-response cache)

## Tech Stack

- [Next.js](https://next.js.org/) (App Router) + TypeScript
- [Tailwind CSS](https://tailwindcss.com/)
- [Supabase](https://supabase.com/) (Auth + PostgreSQL)
- [Google Gemini API](https://ai.google.dev/) (`gemini-2.5-flash`)
- [Spoonacular](https://spoonacular.com/food-api) recipe search
- [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide.html) nutrition fallback
- Optional Redis (`REDIS_URL`) via `ioredis`

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com/) project
- A [Google AI Studio](https://aistudio.google.com/) API key
- A [Spoonacular](https://spoonacular.com/food-api) API key (for personalized recommend)
- Optional: [USDA FoodData Central](https://fdc.nal.usda.gov/api-key-signup.html) API key
- Optional: Redis URL for shared cache across instances

## Local Development

### 1. Clone and install

```bash
cd personal_plate
npm install
```

### 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com/)
2. Go to **SQL Editor** and run the contents of `supabase-schema.sql` (includes recommendation profile fields for new installs)
3. On an existing database, also run:
   - `fridge-items-migration.sql` — Virtual Fridge table
   - `recipe-images-storage.sql` — AI recipe image storage bucket/policies
   - `profile-recommendation-fields-migration.sql` — activity level, calorie/budget targets, preferred/disliked foods
4. Go to **Project Settings → API** and copy your project URL and anon key
5. Enable **Email** auth provider under **Authentication → Providers**

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in:

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `GEMINI_API_KEY` | Yes | Gemini for generation, video detect, ranking |
| `GEMINI_API_KEY_FALLBACK` | No | Secondary Gemini key |
| `NEXT_PUBLIC_GEMINI_API_KEY` | No* | Browser image generation flows |
| `SPOONACULAR_API_KEY` | For recommend API | Candidate recipe search |
| `USDA_API_KEY` | No | Nutrition fill-in when Spoonacular data is incomplete (ON by default when set) |
| `RECOMMEND_ENABLE_USDA` | No | Default ON; set `false` / `0` / `off` to skip USDA on recommend |
| `REDIS_URL` | No | Shared Redis cache; in-memory used otherwise |

\*Needed if you use client-side recipe image generation.

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Tests and typecheck

```bash
npm test
npm run typecheck
npm run lint
```

### 6. Build for production

```bash
npm run build
npm start
```

## Routes

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/login` | Sign in / sign up |
| `/dashboard` | Protected dashboard |
| `/profile` | Health profile form (includes BMI preview, activity, budget, prefs) |
| `/recommend` | Meal suggestions (Spoonacular + ranking + video) |
| `/discover` | Redirects to `/recommend` (legacy URL) |
| `/fridge` | Virtual fridge |
| `/history` | Saved recipes |
| `/api/generate-recipes` | POST — Gemini meal suggestion generation (kept; not on Recommend UI) |
| `/api/save-recipe` | POST — Save ranked (or legacy AI Suggest) recipe to Supabase |
| `/api/generate-recipe-image` | POST — Generate/store recipe image |
| `/api/ingredients/detect` | POST — Authenticated video ingredient detection |
| `/api/recipes/recommend` | POST — Personalized recommend pipeline |
| `/api/recipes/[id]` | GET — Spoonacular recipe detail (instructions / ingredients) |

## New API Endpoints

### `POST /api/ingredients/detect`

Authenticated. Multipart form with a video field (`video` or `file`). Accepts **mp4**, **mov**, **webm** (app max ~20MB). On **Vercel**, request bodies are capped at **~4.5MB** — prefer clips under ~4MB or uploads fail with 413 before the route runs.

```bash
curl -X POST http://localhost:3000/api/ingredients/detect \
  -H "Cookie: <your-supabase-auth-cookie>" \
  -F "video=@./fridge.mp4"
```

Example response:

```json
{
  "ingredients": [
    { "name": "tomato", "estimated_quantity": "3 pieces", "confidence": 0.92 }
  ],
  "cooking_method": "none visible",
  "kitchen_tools": ["cutting board", "knife"]
}
```

### `POST /api/recipes/recommend`

Authenticated. Accepts JSON or multipart. Combine **manual ingredients**, **fridge items**, and/or **video**.

JSON example:

```bash
curl -X POST http://localhost:3000/api/recipes/recommend \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-supabase-auth-cookie>" \
  -d '{
    "ingredients": ["chicken breast", "broccoli", "garlic"],
    "includeFridge": true,
    "maxReadyTime": 35
  }'
```

Multipart example (video + ingredients):

```bash
curl -X POST http://localhost:3000/api/recipes/recommend \
  -H "Cookie: <your-supabase-auth-cookie>" \
  -F "video=@./kitchen.mp4" \
  -F 'ingredients=["eggs","spinach"]' \
  -F "includeFridge=true"
```

Example response:

```json
{
  "recipes": [
    {
      "id": 716429,
      "title": "Garlic Chicken Broccoli Bowl",
      "image": "https://...",
      "score": 96,
      "calories": 430,
      "protein": 35,
      "fat": 12,
      "carbs": 38,
      "readyInMinutes": 25,
      "matchedIngredients": ["chicken breast", "broccoli", "garlic"],
      "missingIngredients": ["soy sauce"],
      "reason": "High protein, strong ingredient match, within calorie target.",
      "instructions": ["Season chicken", "Steam broccoli", "Combine and serve"]
    }
  ],
  "detection": null,
  "ingredientsUsed": ["chicken breast", "broccoli", "garlic"]
}
```

Pipeline: detect ingredients (optional) → Spoonacular search (~30–50 candidates) → USDA nutrition fill-in when needed → Gemini ranking (6–10 results, heuristic fallback if ranking temporarily fails).

On the Rank UI, expand a card to see steps. If `instructions` are empty, the client calls `GET /api/recipes/[id]` for Spoonacular detail. **Save Recipe** posts the ranked payload to `/api/save-recipe` (adapter maps it into the same JSONB shape as AI Suggest) → `/history`.

### `GET /api/recipes/[id]`

Authenticated. Thin Spoonacular detail fetch used when Rank expand needs cooking steps.

```bash
curl http://localhost:3000/api/recipes/716429 \
  -H "Cookie: <your-supabase-auth-cookie>"
```

### `POST /api/save-recipe`

Authenticated. Accepts either:

- AI Suggest `RecommendedRecipe` (`title`, `image_url`, `ingredients`, …), or
- Personalized Rank `RankedRecipeRecommendation` (`score`, `image`, `matchedIngredients`, …) — normalized server-side before insert.

### Out of scope (confirmed)

- No separate `fitness_goal` DB column (use `nutrition_goals` + `activity_level` + BMI)
- No multi-day meal plans
- No Zod request schemas (manual parsers)
- No end-to-end cache of the full `recommendRecipes` response (layer caches only)

## Deploy to Vercel

1. Push the repo to GitHub
2. Import the project in [Vercel](https://vercel.com/)
3. Add environment variables from `.env.example` (see required vs optional in [docs/deploy-checklist.md](docs/deploy-checklist.md))
4. On Supabase: run SQL in order, ensure `recipe-images` bucket, set **Auth Site URL** + **Redirect URLs** to your Vercel domain
5. Deploy (set `REDIS_URL` for shared cache across Vercel instances)

> **Note:** `GEMINI_API_KEY`, `SPOONACULAR_API_KEY`, `USDA_API_KEY`, and `REDIS_URL` are server-side only.

Ops checklist (EN/VI): **[docs/deploy-checklist.md](docs/deploy-checklist.md)**.

## Database Schema

See `supabase-schema.sql` for the full schema.

- **profiles** — Patient health information + recommendation fields (RLS: users CRUD own data)
- **recipes** — Saved AI-generated recipes (RLS: users CRUD own data)
- **fridge_items** — Virtual fridge ingredients (RLS: users CRUD own data)

BMI is computed in the app from height/weight and is **not** stored as a DB column.

## Error Handling

PersonalPlate does **not** use mock/fallback data as the primary recommendation path. External API failures return clear HTTP errors:

- Missing API key → `503`
- Quota / rate limit → `429`
- Invalid AI JSON → `502`
- Validation errors → `400`

Ranking may use a deterministic heuristic fallback only when Gemini ranking fails after Spoonacular candidates were already retrieved, so users still receive usable results when possible.
