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

async function enrichNutrition(
  candidates: SpoonacularRecipeCandidate[]
): Promise<SpoonacularRecipeCandidate[]> {
  const enriched = await Promise.all(
    candidates.map(async (candidate) => {
      if (!isNutritionIncomplete(candidate.nutrition)) {
        return candidate;
      }

      try {
        const usda = await estimateRecipeNutritionFromUsda(
          candidate.ingredients,
          candidate.servings || 1
        );
        if (!usda) {
          return candidate;
        }
        return {
          ...candidate,
          nutrition: usda,
        };
      } catch (err) {
        if (err instanceof UsdaError && err.code === "missing_key") {
          return candidate;
        }
        return candidate;
      }
    })
  );

  return enriched;
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

  const candidates = await searchSpoonacularRecipes({
    ingredients: ingredientsUsed,
    profile: input.profile,
    number: 40,
    maxReadyTime: input.maxReadyTime,
  });

  const withNutrition = await enrichNutrition(candidates);
  const recipes = await rankRecipeCandidates({
    profile: input.profile,
    availableIngredients: ingredientsUsed,
    candidates: withNutrition,
  });

  return {
    recipes,
    detection,
    ingredientsUsed,
  };
}

export class RecommendValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecommendValidationError";
  }
}
