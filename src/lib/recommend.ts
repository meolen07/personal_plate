import { cacheGet, cacheKey, cacheSet } from "@/lib/cache";
import { detectIngredientsFromVideo } from "@/lib/ingredient-detect";
import { rankRecipeCandidates } from "@/lib/recipe-rank";
import {
  backfillIncompleteNutritionFromSpoonacular,
  isNutritionIncomplete,
  searchSpoonacularRecipes,
  SPOONACULAR_NUTRITION_BACKFILL_MAX,
} from "@/lib/spoonacular";
import { estimateRecipeNutritionFromUsda, UsdaError } from "@/lib/usda";
import type {
  IngredientDetectionResult,
  Profile,
  RecipeRecommendResponse,
  SpoonacularRecipeCandidate,
} from "@/lib/types";

/** Spoonacular complexSearch size — lean for latency; rank uses top 10. */
export const RECOMMEND_CANDIDATE_COUNT = 12;

/** Whole-response cache TTL (seconds) for identical ingredient + profile queries. */
export const RECOMMEND_RESPONSE_CACHE_TTL = 60 * 12;

/**
 * Cap USDA gap-fills (default ON). Multi food lookups dominate latency, so keep
 * these caps tight. Opt out with `RECOMMEND_ENABLE_USDA=false` / `0` / `off`.
 * Only runs after Spoonacular search + detail backfill still leave macros empty.
 */
export const MAX_USDA_RECIPE_ENRICHMENTS = 3;

/** Keep USDA ingredient lookups tiny on the default enrichment path. */
export const MAX_USDA_INGREDIENTS_PER_RECIPE = 3;

/**
 * Whether recommend may call USDA for incomplete Spoonacular nutrition.
 * Default ON when unset; set `RECOMMEND_ENABLE_USDA` to false/0/off/no to disable.
 */
export function isRecommendUsdaEnabled(): boolean {
  const raw = process.env.RECOMMEND_ENABLE_USDA?.trim().toLowerCase();
  if (!raw) return true;
  return !(raw === "0" || raw === "false" || raw === "off" || raw === "no");
}

export function normalizeIngredientList(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim().replace(/\s+/g, " ");
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

export function parseOptionalStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return normalizeIngredientList(
    value.map((item) => (typeof item === "string" ? item : String(item ?? "")))
  );
}

/** Stable profile slice used for recommend response cache keys. */
export function profileCachePayload(profile: Profile | null) {
  if (!profile) return null;
  return {
    allergies: profile.allergies,
    medical_conditions: profile.medical_conditions,
    dietary_restrictions: profile.dietary_restrictions,
    nutrition_goals: profile.nutrition_goals,
    preferred_cuisine: profile.preferred_cuisine,
    activity_level: profile.activity_level,
    target_calories: profile.target_calories,
    budget_usd: profile.budget_usd,
    preferred_foods: profile.preferred_foods,
    disliked_foods: profile.disliked_foods,
    height_cm: profile.height_cm,
    weight_kg: profile.weight_kg,
    age: profile.age,
    gender: profile.gender,
  };
}

export function buildRecommendResponseCacheKey(input: {
  userId?: string;
  ingredientsUsed: string[];
  profile: Profile | null;
  maxReadyTime?: number;
}): string {
  return cacheKey("recommend:response", {
    userId: input.userId ?? "anonymous",
    ingredients: [...input.ingredientsUsed]
      .map((i) => i.toLowerCase())
      .sort(),
    profile: profileCachePayload(input.profile),
    maxReadyTime: input.maxReadyTime ?? null,
    // Bust response caches that may have stored 0-macro recipes.
    nutritionV: 2,
  });
}

async function enrichNutritionFromUsda(
  candidates: SpoonacularRecipeCandidate[]
): Promise<SpoonacularRecipeCandidate[]> {
  if (!isRecommendUsdaEnabled()) {
    return candidates;
  }

  const needsEnrichment = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => isNutritionIncomplete(candidate.nutrition))
    .slice(0, MAX_USDA_RECIPE_ENRICHMENTS);

  if (needsEnrichment.length === 0) {
    return candidates;
  }

  const enrichedByIndex = new Map<number, SpoonacularRecipeCandidate>();

  await Promise.all(
    needsEnrichment.map(async ({ candidate, index }) => {
      try {
        const usda = await estimateRecipeNutritionFromUsda(
          candidate.ingredients.slice(0, MAX_USDA_INGREDIENTS_PER_RECIPE),
          candidate.servings || 1
        );
        if (!usda) {
          return;
        }
        enrichedByIndex.set(index, {
          ...candidate,
          nutrition: usda,
        });
      } catch (err) {
        if (err instanceof UsdaError && err.code === "missing_key") {
          return;
        }
      }
    })
  );

  if (enrichedByIndex.size === 0) {
    return candidates;
  }

  return candidates.map(
    (candidate, index) => enrichedByIndex.get(index) ?? candidate
  );
}

/**
 * Prefer Spoonacular nutrition (search → detail backfill), then USDA gap-fill
 * (default ON; disable via RECOMMEND_ENABLE_USDA).
 */
async function enrichNutrition(
  candidates: SpoonacularRecipeCandidate[]
): Promise<SpoonacularRecipeCandidate[]> {
  const withSpoonacular = await backfillIncompleteNutritionFromSpoonacular(
    candidates,
    SPOONACULAR_NUTRITION_BACKFILL_MAX
  );
  return enrichNutritionFromUsda(withSpoonacular);
}

export async function recommendRecipes(input: {
  profile: Profile | null;
  ingredients?: string[];
  fridgeItems?: string[];
  video?: {
    buffer: Buffer;
    mimeType: string;
    fileName?: string;
  };
  maxReadyTime?: number;
  userId?: string;
}): Promise<RecipeRecommendResponse> {
  let detection: IngredientDetectionResult | undefined;

  if (input.video) {
    detection = await detectIngredientsFromVideo(input.video);
  }

  const detectedNames =
    detection?.ingredients.map((item) => item.name) ?? [];

  const ingredientsUsed = normalizeIngredientList([
    ...(input.ingredients ?? []),
    ...(input.fridgeItems ?? []),
    ...detectedNames,
  ]);

  if (ingredientsUsed.length === 0) {
    throw new RecommendValidationError(
      "Provide at least one ingredient via video, manual ingredients, or fridge items."
    );
  }

  const responseCacheId = buildRecommendResponseCacheKey({
    userId: input.userId,
    ingredientsUsed,
    profile: input.profile,
    maxReadyTime: input.maxReadyTime,
  });

  const cached = await cacheGet<RecipeRecommendResponse>(responseCacheId);
  if (cached?.recipes?.length) {
    return {
      recipes: cached.recipes,
      ingredientsUsed: cached.ingredientsUsed?.length
        ? cached.ingredientsUsed
        : ingredientsUsed,
      detection,
    };
  }

  const candidates = await searchSpoonacularRecipes({
    ingredients: ingredientsUsed,
    profile: input.profile,
    number: RECOMMEND_CANDIDATE_COUNT,
    maxReadyTime: input.maxReadyTime,
  });

  const withNutrition = await enrichNutrition(candidates);
  const recipes = await rankRecipeCandidates({
    profile: input.profile,
    availableIngredients: ingredientsUsed,
    candidates: withNutrition,
  });

  const result: RecipeRecommendResponse = {
    recipes,
    detection,
    ingredientsUsed,
  };

  await cacheSet(
    responseCacheId,
    {
      recipes: result.recipes,
      ingredientsUsed: result.ingredientsUsed,
    },
    RECOMMEND_RESPONSE_CACHE_TTL
  );

  return result;
}

export class RecommendValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecommendValidationError";
  }
}
