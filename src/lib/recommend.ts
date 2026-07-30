import { cacheGet, cacheKey, cacheSet } from "@/lib/cache";
import { detectIngredientsFromVideo } from "@/lib/ingredient-detect";
import { rankRecipeCandidates } from "@/lib/recipe-rank";
import {
  isNutritionIncomplete,
  searchSpoonacularRecipes,
} from "@/lib/spoonacular";
import { estimateRecipeNutritionFromUsda, UsdaError } from "@/lib/usda";
import type {
  IngredientDetectionResult,
  Profile,
  RecipeRecommendResponse,
  SpoonacularRecipeCandidate,
} from "@/lib/types";

/** Spoonacular complexSearch size — lower = faster; still enough for top-10 rank. */
export const RECOMMEND_CANDIDATE_COUNT = 20;

/** Whole-response cache TTL (seconds) for identical ingredient + profile queries. */
export const RECOMMEND_RESPONSE_CACHE_TTL = 60 * 8;

/** Cap USDA gap-fills so incomplete batches cannot explode latency. */
export const MAX_USDA_RECIPE_ENRICHMENTS = 8;

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
  });
}

async function enrichNutrition(
  candidates: SpoonacularRecipeCandidate[]
): Promise<SpoonacularRecipeCandidate[]> {
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
          candidate.ingredients,
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
