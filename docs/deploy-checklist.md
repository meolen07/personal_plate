# Deploy checklist / Checklist deploy

PersonalPlate → Vercel + Supabase. Do **not** invent secrets; copy real values from dashboards into Vercel / `.env.local`.

---

## 0. Profile DB migration (do this first on existing Supabase)

**Symptom:** `/profile` Save fails with:

> Could not find the `'activity_level'` column of `'profiles'` in the schema cache

That means production still has an **old** `profiles` table. The app writes recommend fields that are not on the DB yet.

**Fix (existing project):**
1. Supabase Dashboard → **SQL Editor** → New query  
2. Paste and run the full contents of `profile-recommendation-fields-migration.sql`  
3. Wait a few seconds (or **Project Settings → API → Reload schema**)  
4. Retry **Save** on `/profile`

Columns added (idempotent `IF NOT EXISTS`): `nutrition_goals`, `preferred_cuisine`, `activity_level`, `target_calories`, `budget_usd`, `preferred_foods`, `disliked_foods`.

**Fresh project:** running `supabase-schema.sql` already includes these columns — skip this migration.

**Tiếng Việt:** Lỗi `activity_level` / schema cache = chưa chạy migration profile. Mở SQL Editor, chạy `profile-recommendation-fields-migration.sql`, đợi vài giây, Save lại.

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
| `USDA_API_KEY` | No | Nutrition fill-in when Spoonacular is incomplete (ON by default when set) |
| `RECOMMEND_ENABLE_USDA` | No | Default ON; set `false`/`0`/`off` to skip USDA |
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
1. **`profile-recommendation-fields-migration.sql` first** — otherwise `/profile` Save hits `activity_level` schema-cache error (see **§0** above)  
2. `fridge-items-migration.sql` (if `fridge_items` missing)  
3. `recipe-images-storage.sql`  

**Tiếng Việt:** Project mới → schema rồi storage. Project cũ → **migration profile recommend trước** (tránh lỗi schema cache) → fridge (nếu thiếu) → storage.

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

## 6. Video upload size (Vercel body limit)

App validation allows kitchen videos up to **~20 MB** (`MAX_VIDEO_BYTES` in `src/lib/video-upload.ts`).

**Vercel Functions hard-cap request bodies at ~4.5 MB** (Hobby and Pro). Multipart uploads to `/api/ingredients/detect` or `/api/recipes/recommend` above that are rejected with **413** before our handlers run — often looking like a vague connection error in the UI.

Practical guidance:
- Prefer clips **under ~4 MB** in production (short, lower resolution).
- Raising the app limit to 25–30 MB does **not** help on Vercel; larger files need client compression or direct-to-storage (e.g. Vercel Blob) then server fetch.
- Local `next dev` can accept larger bodies than production Vercel.

---

## 7. Ship steps (short)

1. Push branch / merge to GitHub  
2. Vercel → Import repo → set env vars above  
3. Run SQL + bucket + Auth URLs on Supabase  
4. Deploy → smoke-test signup, profile, fridge, Recommend  

Local verify before deploy:

```bash
npm test && npm run typecheck && npm run build
```

Full setup guide: `HUONG-DAN.md` · English overview: `README.md`.
