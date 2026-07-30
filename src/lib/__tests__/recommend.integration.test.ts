import { afterEach, describe, expect, it, vi } from "vitest";
import { clearMemoryCache } from "@/lib/cache";
import type { Profile, SpoonacularRecipeCandidate } from "@/lib/types";

const baseProfile: Profile = {
  full_name: "Test User",
  age: 30,
  gender: "female",
  height_cm: 165,
  weight_kg: 60,
  medical_conditions: [],
  medications: [],
  allergies: ["peanuts"],
  dietary_restrictions: ["gluten-free"],
  nutrition_goals: "high protein",
  preferred_cuisine: "Mediterranean",
  activity_level: "moderately_active",
  target_calories: 450,
  budget_usd: 10,
  preferred_foods: ["salmon"],
  disliked_foods: ["cilantro"],
};

function makeCandidate(
  overrides: Partial<SpoonacularRecipeCandidate> & { id: number; title: string }
): SpoonacularRecipeCandidate {
  return {
    image: "https://example.com/recipe.jpg",
    readyInMinutes: 25,
    servings: 2,
    cuisines: ["Mediterranean"],
    diets: ["gluten free"],
    dishTypes: ["main course"],
    ingredients: ["salmon", "olive oil", "lemon"],
    instructions: ["Season salmon", "Bake 20 minutes"],
    nutrition: {
      calories: 430,
      protein: 35,
      fat: 12,
      carbs: 38,
    },
    pricePerServing: 8,
    ...overrides,
  };
}

describe("recommendRecipes orchestration", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    clearMemoryCache();
  });

  it("merges manual + fridge ingredients, skips USDA by default, and ranks", async () => {
    vi.stubEnv("SPOONACULAR_API_KEY", "test-spoonacular");
    vi.stubEnv("USDA_API_KEY", "test-usda");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini");

    const incomplete = makeCandidate({
      id: 1,
      title: "Lemon Salmon",
      nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
    });
    const complete = makeCandidate({
      id: 2,
      title: "Herbed Chicken",
      ingredients: ["chicken", "broccoli", "garlic"],
      nutrition: { calories: 400, protein: 40, fat: 10, carbs: 20 },
    });

    const searchSpoonacularRecipes = vi.fn(async () => [incomplete, complete]);

    vi.doMock("@/lib/spoonacular", () => ({
      searchSpoonacularRecipes,
      isNutritionIncomplete: (nutrition: {
        calories: number;
        protein: number;
        fat: number;
        carbs: number;
      }) =>
        nutrition.calories <= 0 &&
        nutrition.protein <= 0 &&
        nutrition.fat <= 0 &&
        nutrition.carbs <= 0,
    }));

    const estimateRecipeNutritionFromUsda = vi.fn(async () => ({
      calories: 430,
      protein: 35,
      fat: 12,
      carbs: 38,
      fiber: 4,
      sodium: 400,
    }));
    vi.doMock("@/lib/usda", () => ({
      UsdaError: class UsdaError extends Error {
        code: string;
        constructor(message: string, code: string) {
          super(message);
          this.code = code;
        }
      },
      estimateRecipeNutritionFromUsda,
    }));

    vi.doMock("@/lib/recipe-rank", () => ({
      rankRecipeCandidates: vi.fn(async ({ candidates }) =>
        candidates.map(
          (
            candidate: SpoonacularRecipeCandidate,
            index: number
          ) => ({
            title: candidate.title,
            image: candidate.image,
            score: 96 - index,
            calories: candidate.nutrition.calories,
            protein: candidate.nutrition.protein,
            fat: candidate.nutrition.fat,
            carbs: candidate.nutrition.carbs,
            readyInMinutes: candidate.readyInMinutes,
            matchedIngredients: ["salmon"],
            missingIngredients: [],
            reason: "Strong profile fit",
          })
        )
      ),
    }));

    vi.doMock("@/lib/ingredient-detect", () => ({
      detectIngredientsFromVideo: vi.fn(),
    }));

    const { recommendRecipes } = await import("@/lib/recommend");
    const { rankRecipeCandidates } = await import("@/lib/recipe-rank");

    const result = await recommendRecipes({
      profile: baseProfile,
      ingredients: ["salmon", "lemon"],
      fridgeItems: ["olive oil", "salmon"],
      userId: "user-1",
    });

    expect(result.ingredientsUsed).toEqual(["salmon", "lemon", "olive oil"]);
    expect(estimateRecipeNutritionFromUsda).not.toHaveBeenCalled();
    expect(rankRecipeCandidates).toHaveBeenCalled();
    expect(searchSpoonacularRecipes).toHaveBeenCalledWith(
      expect.objectContaining({ number: 12 })
    );
    expect(result.recipes[0]).toMatchObject({
      title: "Lemon Salmon",
      score: 96,
      calories: 0,
      reason: "Strong profile fit",
    });

    // Second identical call should hit the whole-response cache.
    const cached = await recommendRecipes({
      profile: baseProfile,
      ingredients: ["salmon", "lemon"],
      fridgeItems: ["olive oil", "salmon"],
      userId: "user-1",
    });
    expect(cached.recipes[0]?.title).toBe("Lemon Salmon");
    expect(searchSpoonacularRecipes).toHaveBeenCalledTimes(1);
    expect(rankRecipeCandidates).toHaveBeenCalledTimes(1);
  });

  it("enriches incomplete nutrition via USDA when RECOMMEND_ENABLE_USDA is set", async () => {
    vi.stubEnv("SPOONACULAR_API_KEY", "test-spoonacular");
    vi.stubEnv("USDA_API_KEY", "test-usda");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini");
    vi.stubEnv("RECOMMEND_ENABLE_USDA", "true");

    const incomplete = makeCandidate({
      id: 1,
      title: "Lemon Salmon",
      nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
    });

    vi.doMock("@/lib/spoonacular", () => ({
      searchSpoonacularRecipes: vi.fn(async () => [incomplete]),
      isNutritionIncomplete: () => true,
    }));

    const estimateRecipeNutritionFromUsda = vi.fn(async () => ({
      calories: 430,
      protein: 35,
      fat: 12,
      carbs: 38,
      fiber: 4,
      sodium: 400,
    }));
    vi.doMock("@/lib/usda", () => ({
      UsdaError: class UsdaError extends Error {
        code: string;
        constructor(message: string, code: string) {
          super(message);
          this.code = code;
        }
      },
      estimateRecipeNutritionFromUsda,
    }));

    vi.doMock("@/lib/recipe-rank", () => ({
      rankRecipeCandidates: vi.fn(async ({ candidates }) =>
        candidates.map((candidate: SpoonacularRecipeCandidate) => ({
          title: candidate.title,
          image: candidate.image,
          score: 90,
          calories: candidate.nutrition.calories,
          protein: candidate.nutrition.protein,
          fat: candidate.nutrition.fat,
          carbs: candidate.nutrition.carbs,
          readyInMinutes: candidate.readyInMinutes,
          matchedIngredients: ["salmon"],
          missingIngredients: [],
          reason: "ok",
        }))
      ),
    }));

    vi.doMock("@/lib/ingredient-detect", () => ({
      detectIngredientsFromVideo: vi.fn(),
    }));

    const { recommendRecipes } = await import("@/lib/recommend");
    const result = await recommendRecipes({
      profile: baseProfile,
      ingredients: ["salmon"],
      userId: "user-usda-on",
    });

    expect(estimateRecipeNutritionFromUsda).toHaveBeenCalledTimes(1);
    expect(result.recipes[0]?.calories).toBe(430);
  });

  it("skips USDA when Spoonacular nutrition is already complete", async () => {
    vi.stubEnv("SPOONACULAR_API_KEY", "test-spoonacular");
    vi.stubEnv("USDA_API_KEY", "test-usda");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini");
    vi.stubEnv("RECOMMEND_ENABLE_USDA", "true");

    const complete = makeCandidate({
      id: 2,
      title: "Herbed Chicken",
      ingredients: ["chicken", "broccoli", "garlic"],
      nutrition: { calories: 400, protein: 40, fat: 10, carbs: 20 },
    });

    vi.doMock("@/lib/spoonacular", () => ({
      searchSpoonacularRecipes: vi.fn(async () => [complete]),
      isNutritionIncomplete: () => false,
    }));

    const estimateRecipeNutritionFromUsda = vi.fn(async () => null);
    vi.doMock("@/lib/usda", () => ({
      UsdaError: class UsdaError extends Error {
        code: string;
        constructor(message: string, code: string) {
          super(message);
          this.code = code;
        }
      },
      estimateRecipeNutritionFromUsda,
    }));

    vi.doMock("@/lib/recipe-rank", () => ({
      rankRecipeCandidates: vi.fn(async ({ candidates }) =>
        candidates.map((candidate: SpoonacularRecipeCandidate) => ({
          title: candidate.title,
          image: candidate.image,
          score: 90,
          calories: candidate.nutrition.calories,
          protein: candidate.nutrition.protein,
          fat: candidate.nutrition.fat,
          carbs: candidate.nutrition.carbs,
          readyInMinutes: candidate.readyInMinutes,
          matchedIngredients: [],
          missingIngredients: [],
          reason: "ok",
        }))
      ),
    }));

    vi.doMock("@/lib/ingredient-detect", () => ({
      detectIngredientsFromVideo: vi.fn(),
    }));

    const { recommendRecipes } = await import("@/lib/recommend");
    await recommendRecipes({
      profile: baseProfile,
      ingredients: ["chicken"],
      userId: "user-skip-usda",
    });

    expect(estimateRecipeNutritionFromUsda).not.toHaveBeenCalled();
  });

  it("throws when no ingredients are provided", async () => {
    const { recommendRecipes, RecommendValidationError } = await import(
      "@/lib/recommend"
    );

    await expect(
      recommendRecipes({
        profile: baseProfile,
        ingredients: [],
        fridgeItems: [],
      })
    ).rejects.toBeInstanceOf(RecommendValidationError);
  });
});
