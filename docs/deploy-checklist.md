# Deploy checklist / Checklist deploy

PersonalPlate → Vercel + Supabase. Do **not** invent secrets; copy real values from dashboards into Vercel / `.env.local`.

---

## 1. Vercel environment variables

| Variable | Required? | Notes |
|----------|-----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | Same page, `anon` / `public` key |
| `GEMINI_API_KEY` | **Yes** | Server-side AI (recipes, video, ranking) |
| `SPOONACULAR_API_KEY` | **Yes** | Candidate search for `/api/recipes/recommend` |
| `GEMINI_API_KEY_FALLBACK` | No | Optional quota fallback |
| `NEXT_PUBLIC_GEMINI_API_KEY` | No* | Browser image-gen flows only |
| `USDA_API_KEY` | No | Nutrition fill-in when Spoonacular is incomplete |
| `REDIS_URL` | **Recommended on Vercel** | Shared cache across serverless instances; without it each instance uses in-memory cache |

Template: `.env.example`. After changing env on Vercel → **Redeploy**.

**Tiếng Việt:** Bắt buộc: Supabase URL + anon key, `GEMINI_API_KEY`, `SPOONACULAR_API_KEY`. Trên Vercel nên set `REDIS_URL` (Upstash/Redis Cloud) vì nhiều instance.

---

## 2. Supabase SQL order

### Fresh project
1. `supabase-schema.sql` — `profiles` (incl. recommend fields), `recipes`, `fridge_items`, RLS, indexes  
2. `recipe-images-storage.sql` — bucket `recipe-images` + policies  

Do **not** need `fridge-items-migration.sql` or `profile-recommendation-fields-migration.sql` on a fresh install (already in schema).

### Existing project (already has older schema)
1. `fridge-items-migration.sql` (if `fridge_items` missing)  
2. `recipe-images-storage.sql`  
3. `profile-recommendation-fields-migration.sql` (recommend profile columns)  

**Tiếng Việt:** Project mới → schema rồi storage. Project cũ → migration fridge (nếu thiếu) → storage → migration profile recommend.

---

## 3. Storage bucket `recipe-images`

- Prefer running `recipe-images-storage.sql` (creates public bucket + RLS by user folder).
- Dashboard check: **Storage** → `recipe-images` → **Public**.
- Manual create still needs the SQL **policies**.

---

## 4. Auth Site URL / Redirect URLs

Supabase → **Authentication** → **URL Configuration**:

| Setting | Local | Production (example) |
|---------|--------|----------------------|
| **Site URL** | `http://localhost:3000` | `https://YOUR-APP.vercel.app` |
| **Redirect URLs** | `http://localhost:3000/**` | `https://YOUR-APP.vercel.app/**` (+ custom domain if any) |

Also enable **Email** provider: Authentication → Providers → Email.

**Tiếng Việt:** Sau khi có URL Vercel, cập nhật Site URL + Redirect URLs — nếu không, login/callback sẽ fail.

---

## 5. REDIS_URL on Vercel

- Optional locally (in-memory is fine for one process).
- **Recommended in production** on Vercel so Spoonacular/USDA/ranking caches are shared across instances.
- If Redis misconfigured, fix the URL or clear `REDIS_URL` to fall back to memory (weaker on serverless).

---

## 6. Ship steps (short)

1. Push branch / merge to GitHub  
2. Vercel → Import repo → set env vars above  
3. Run SQL + bucket + Auth URLs on Supabase  
4. Deploy → smoke-test signup, profile, fridge, AI Suggest, Personalized Rank  

Local verify before deploy:

```bash
npm test && npm run typecheck && npm run build
```

Full setup guide: `HUONG-DAN.md` · English overview: `README.md`.
