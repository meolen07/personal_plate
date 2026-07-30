# Phase 2 — Requirements Lock & Reuse Map

**Ngày:** 2026-07-30  
**Trạng thái:** **COMPLETE** (optimal path). Phase 3 **SKIPPED**. Phase 4–5 **DONE**. Phase 6–8 **SKIPPED**. Phase 9 **DONE**.  
**Nguyên tắc:** Pipeline Personalized Rank **đã có end-to-end** — Phase 3+ chỉ **reuse / extend**, không rebuild.

---

## 1. Chốt scope (Requirements Lock)

### 1.1 Primary vs secondary path

| Vai trò | Đường | Entry points | Ghi chú |
|--------|--------|--------------|--------|
| **Primary** | Personalized Rank | UI: `/recommend?tab=ranked` → `PersonalizedRankPanel` → `POST /api/recipes/recommend` → `recommendRecipes()` | Spoonacular → USDA (gap fill) → Gemini ranking (+ heuristic fallback) |
| **Secondary** | AI Suggest | UI: `/recommend` (tab mặc định) → `AiSuggestPanel` → `POST /api/generate-recipes` → `generateRecipeWithGemini()` | Giữ nguyên; không đụng trừ khi cần tương thích save/history |

**Đã xác minh trong codebase:**

- `src/lib/recommend.ts` — `recommendRecipes()`
- `src/lib/recipe-rank.ts` — `rankRecipeCandidates()`, `rankRecipesHeuristically()`
- `src/app/api/recipes/recommend/route.ts` — auth + parse JSON/multipart + `getProfile` / `getFridgeItems`
- `src/components/PersonalizedRankPanel.tsx` — form video/ingredients/fridge/maxReadyTime + **Save** (Phase 4)
- `src/components/RankedRecipeCard.tsx` — hiển thị kết quả ranked + **Save Recipe** + instructions detail
- `src/app/api/save-recipe/route.ts` + `AiSuggestPanel.handleSave` — AI Suggest save; Phase 4 cũng nhận ranked qua adapter
- `src/lib/save-ranked-recipe.ts` — `toRecommendedRecipeFromRanked` / `normalizeGeneratedRecipeForSave`
- `src/app/api/recipes/[id]/route.ts` — thin Spoonacular detail (Phase 5)

### 1.2 Must-have / Nice-to-have / Out-of-scope

#### Must-have gaps

1. ~~**Lưu món ranked vào history**~~ — **DONE (Phase 4):** adapter `RankedRecipeRecommendation` → `RecommendedRecipe` JSONB; reuse `saveRecipe` / `POST /api/save-recipe`.
2. ~~**UX save trên Personalized Rank**~~ — **DONE (Phase 4):** nút Save trên `RankedRecipeCard`.
3. **Không phá primary pipeline** — giữ contract response `{ recipes, detection?, ingredientsUsed }`.
4. ~~**Regression tests**~~ — **DONE (Phase 9):** suite + gaps Phase 4–5.

#### Nice-to-have

1. Trường `fitness_goal` riêng — **SKIPPED** (dùng `nutrition_goals` + `activity_level` + BMI).
2. Harden request validation (helper chặt hơn) trên `/api/recipes/recommend` — **SKIPPED** (không Zod; manual parsers đủ).
3. Cache **toàn bộ** `RecipeRecommendResponse` — **SKIPPED**.
4. Mở rộng chi tiết món ranked (instructions đầy đủ từ Spoonacular detail) — **DONE (Phase 5)**.
5. Tinh chỉnh prompt/heuristic ranking — **SKIPPED** (không còn pain được yêu cầu).

#### Out-of-scope (confirmed)

1. **Meal plans** nhiều ngày / tuần.
2. Rebuild pipeline, API song song, Nest/controller layer mới.
3. OpenAI / model ranking khác Gemini.
4. Migration schema lớn không liên quan recommend.
5. Đổi auth provider / bỏ Supabase RLS.
6. Thêm env mới trừ khi user xác nhận (xem mục 4).
7. **Phase 3 (`fitness_goal`)** — **SKIPPED**.
8. **Phase 6 (Zod / validation harden)** — **SKIPPED**.
9. **Phase 7 (e2e recommend cache)** — **SKIPPED**.
10. **Phase 8 (ranking quality tweaks)** — **SKIPPED**.

### 1.3 Quyết định tường minh — **ĐÃ XÁC NHẬN**

| Quyết định | Trả lời chốt | Ghi chú |
|------------|--------------|---------|
| **`fitness_goal`?** | **A — Không thêm cột.** Giữ `nutrition_goals` + `activity_level` + BMI. | → **Phase 3 SKIPPED** |
| **Save ranked recipes?** | **A — Có, must-have.** | → **Phase 4 (DONE)** |
| **Meal plans?** | **A — Out-of-scope.** | — |
| **End-to-end response cache?** | **A — Không.** | Giữ cache từng lớp |
| **Zod validation?** | **A — Không.** | Giữ manual parsers |

---

## 2. Bản đồ tái sử dụng (Reuse Map)

| Concern | Mục đích | Reuse (file + symbol) | Gap | Phase | Hành động |
|---------|----------|----------------------|-----|-------|-----------|
| **Auth** | Bảo vệ trang & API recommend | `getUser` / `requireUser` (`src/lib/auth.ts`); `middleware.ts` | — | — | **reuse** |
| **Profile / BMI** | Cá nhân hóa search + rank | `Profile`; `getProfile` / `upsertProfile`; `computeBmi`; `assessProfileForRanking` | Không thêm `fitness_goal` | 3 **SKIPPED**; 5 **DONE** | **reuse** |
| **Fridge** | Nguồn nguyên liệu | `getFridgeItems`; `includeFridge` | — | — | **reuse** |
| **Video ingredient detection** | Detect từ video | `detectIngredientsFromVideo`; `POST /api/ingredients/detect` | — | 6 **SKIPPED** | **reuse** |
| **Spoonacular** | Candidate search + detail | `searchSpoonacularRecipes`, `getSpoonacularRecipeById`; `GET /api/recipes/[id]` | — | 5 **DONE** | **reuse** |
| **USDA** | Fill nutrition thiếu | `estimateRecipeNutritionFromUsda` | Key optional | — | **reuse** |
| **Gemini ranking** | Rank 6–10 món | `rankRecipeCandidates` | Prompt tweaks | 8 **SKIPPED** | **reuse** |
| **Heuristic fallback** | Khi Gemini fail | `rankRecipesHeuristically` | — | 8 **SKIPPED** | **reuse** |
| **Cache** | Giảm quota/latency | `cache.ts`; namespaces spoonacular / usda / `gemini:rank` | E2E cache | 7 **SKIPPED** | **reuse** |
| **Recommend orchestration** | Ghép detect → search → USDA → rank | `recommendRecipes` | — | — | **reuse** |
| **API routes** | HTTP surface | recommend; detect; save-recipe; `GET /api/recipes/[id]` | — | 4–5 **DONE** | **extended** |
| **UI panels/cards** | UX recommend | `PersonalizedRankPanel`; `RankedRecipeCard` (+ Save + instructions) | — | 5 **DONE** | **extended** |
| **Save / history** | Lưu & xem lại | `save-ranked-recipe.ts`; `/history` | — | 4 **DONE** | **extended** |
| **Types** | Contract TS | `RankedRecipeRecommendation` (+ `id`, `instructions`), … | — | 4–5 **DONE** | **extended** |
| **Tests** | Regression | Phase 4/5/9 coverage | — | 9 **DONE** | **extended** |
| **Docs** | Onboarding | `README.md`, `HUONG-DAN.md`, `.env.example` | — | 9 **DONE** | **extended** |

---

## 3. File placement cheat sheet

| Loại | Đặt ở đâu | Không làm |
|------|-----------|-----------|
| Orchestration / helpers recommend | `src/lib/recommend.ts` hoặc helper nhỏ `src/lib/` | Không tạo `services/` / Nest modules |
| Ranking / prompt | `src/lib/recipe-rank.ts` | Không duplicate Gemini client |
| External APIs | `spoonacular.ts`, `usda.ts`, `ingredient-detect.ts`, `gemini-client.ts` | Không gọi API trực tiếp từ component |
| DB access | `src/lib/database.ts` | Không query Supabase rải rác trong UI |
| Types | `src/lib/types.ts` | Không tạo `dto/` song song |
| API | `src/app/api/.../route.ts` | Không thêm Express server |
| UI recommend | `PersonalizedRankPanel.tsx`, `RankedRecipeCard.tsx` | Không page `/discover` mới (đã redirect) |
| Adapter Ranked → Saved | `src/lib/save-ranked-recipe.ts` (**shipped**) | Không schema SQL mới |
| Tests | `src/lib/__tests__/*`, `src/app/api/**/route.test.ts` | — |
| Planning docs | `docs/` | Không markdown rải root trừ README |

---

## 4. Env vars

**Không cần env mới** cho scope đã chốt. `.env.example` vẫn đủ.

| Biến | Trạng thái | Dùng bởi |
|------|------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Existing | Auth / DB |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Existing | Auth / DB |
| `GEMINI_API_KEY` | Existing | Detect, rank, AI Suggest |
| `GEMINI_API_KEY_FALLBACK` | Existing optional | Gemini failover |
| `NEXT_PUBLIC_GEMINI_API_KEY` | Existing optional | Client image gen (Suggest path) |
| `SPOONACULAR_API_KEY` | Existing (required cho Rank) | `spoonacular.ts` |
| `USDA_API_KEY` | Existing optional | `usda.ts` |
| `REDIS_URL` | Existing optional | `cache.ts` (memory fallback) |

---

## 5. Phase order — shipped vs skipped

| Phase | Nội dung | Status |
|-------|----------|--------|
| **2** | Requirements Lock & Reuse Map | **DONE** |
| **3** | Profile `fitness_goal` | **SKIPPED** |
| **4** | Save ranked → history | **DONE** |
| **5** | UX Rank polish (detail/instructions + empty/profile) | **DONE** |
| **6** | API harden / Zod | **SKIPPED** |
| **7** | E2E response cache | **SKIPPED** |
| **8** | Ranking quality tweaks | **SKIPPED** |
| **9** | Tests bổ sung + docs | **DONE** |

**Feature pack (optimal path): COMPLETE.** Không còn phase tiếp theo trong lock này.

---

## 6. Questions for user — **ĐÃ TRẢ LỜI** (2026-07-30)

1. **`fitness_goal`:** **A)** Giữ `nutrition_goals` ✅ → Phase 3 skipped  
2. **Save ranked recipes:** **A)** Có ✅ → Phase 4 done  
3. **Meal plans nhiều ngày:** **A)** Out-of-scope ✅  
4. **Cache toàn bộ response `recommendRecipes`:** **A)** Không ✅ → Phase 7 skipped  
5. **Zod trên `/api/recipes/recommend`:** **A)** Không ✅ → Phase 6 skipped  

---

## Phụ lục — Pipeline thực tế (đã verify)

```
PersonalizedRankPanel
  → profile readiness Alert (missing / thin)
  → POST /api/recipes/recommend  (getUser, getProfile, optional getFridgeItems)
    → recommendRecipes()
         → detectIngredientsFromVideo()     [nếu có video]
         → searchSpoonacularRecipes()       [cache spoonacular]
         → enrichNutrition() → USDA         [nếu nutrition incomplete]
         → rankRecipeCandidates()           [Gemini → cache; fallback heuristic]
    → JSON { recipes (+ id, instructions), detection?, ingredientsUsed }
  → Expand card: show instructions; nếu thiếu → GET /api/recipes/[id] → getSpoonacularRecipeById
  → Save: toRecommendedRecipeFromRanked() → POST /api/save-recipe → recipes.generated_recipe
  → /history
```

AI Suggest (secondary): `AiSuggestPanel` → `/api/generate-recipes` → có thể `POST /api/save-recipe` → `/history`.

---

### Phase 4 notes (shipped)

- Adapter: `src/lib/save-ranked-recipe.ts`
- Route: `src/app/api/save-recipe/route.ts` normalize ranked **hoặc** RecommendedRecipe
- UI: Save trên `RankedRecipeCard` / `PersonalizedRankPanel`
- History: nutrition_notes + ảnh ranked qua `RecipeImage`
- Tests: `save-ranked-recipe.test.ts`, `save-recipe/route.test.ts`

### Phase 5 notes (shipped)

- Rank payload: `RankedRecipeRecommendation.id` + `instructions`
- Thin detail: `GET /api/recipes/[id]`
- UI: instructions; profile missing/thin Alerts; empty-results warning
- Helper: `assessProfileForRanking` (`profile-rank-readiness.ts`)
- Tests: `profile-rank-readiness.test.ts`, `recipes/[id]/route.test.ts`

### Phase 9 notes (shipped)

- Lint fix: `RankedRecipeCard` ref sync / effect setState
- Extra regression: save ranked + cooking steps; recommend `id`/`instructions`; detail `503` missing_key
- Docs: README, HUONG-DAN, reuse map finalized; `.env.example` unchanged (no new vars)
- Verify: `npm test`, `npm run typecheck`, `npm run lint`

---

*Optimal feature pack COMPLETE. Phase 3 + 6–8 skipped by lock. Stop — no further phases.*
