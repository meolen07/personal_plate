# PersonalPlate

Personalized recipe assistant for safer meal suggestions, ingredient substitutions, and profile-aware guidance.

> **Medical Disclaimer:** PersonalPlate provides general nutrition support and does not replace medical advice from doctors or registered dietitians.

## Features

- **Health Profiles** — Store allergies, medical conditions, medications, and dietary restrictions
- **AI Meal Suggestions** — Gemini-powered dish recommendations based on available ingredients and profile
- **Allergy-Safe Substitutions** — Detects unsafe ingredients and suggests alternatives
- **Recipe History** — Save and revisit past recommendations
- **Secure Auth** — Supabase authentication with row-level security

## Tech Stack

- [Next.js](https://nextjs.org/) (App Router) + TypeScript
- [Tailwind CSS](https://tailwindcss.com/)
- [Supabase](https://supabase.com/) (Auth + PostgreSQL)
- [Google Gemini API](https://ai.google.dev/) (`@google/generative-ai`)

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com/) project
- A [Google AI Studio](https://aistudio.google.com/) API key

## Local Development

### 1. Clone and install

```bash
cd nutricare-ai
npm install
```

### 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com/)
2. Go to **SQL Editor** and run the contents of `supabase-schema.sql`
3. If you want to enable the separated Virtual Fridge feature on an existing database, also run `fridge-items-migration.sql`
4. If you want AI recipe images stored in Supabase Storage, also run `recipe-images-storage.sql`
5. Go to **Project Settings → API** and copy your project URL and anon key
6. Enable **Email** auth provider under **Authentication → Providers**

### 3. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
GEMINI_API_KEY=your-gemini-api-key
NEXT_PUBLIC_GEMINI_API_KEY=your-gemini-api-key
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Build for production

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
| `/profile` | Health profile form |
| `/recommend` | AI meal suggestion flow |
| `/history` | Saved recipes |
| `/api/generate-recipes` | POST — Gemini meal suggestion generation |
| `/api/save-recipe` | POST — Save recipe to Supabase |

## Deploy to Vercel

1. Push the repo to GitHub
2. Import the project in [Vercel](https://vercel.com/)
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY`
4. Deploy

> **Note:** `GEMINI_API_KEY` is server-side only and is never exposed to the browser.

## Database Schema

See `supabase-schema.sql` for the full schema. Two tables:

- **profiles** — Patient health information (RLS: users CRUD own data)
- **recipes** — Saved AI-generated recipes (RLS: users CRUD own data)

## Error Handling

PersonalPlate does **not** use mock/fallback data. If the Gemini API is unavailable:

- Missing API key → configuration error message
- API failure → network/quota error message
- Quota exceeded → usage limit message
- Invalid AI response → processing error message

## Branding

USF CAMLS-inspired color palette:

- USF Green `#006747`
- USF Gold `#CFC493`
- Dark Green `#005432`
- Sand `#EDEBD1`

## License

Private — for demonstration purposes.
