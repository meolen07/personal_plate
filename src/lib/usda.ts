import { cacheGet, cacheKey, cacheSet } from "@/lib/cache";
import type { RecipeNutrition } from "@/lib/types";

export class UsdaError extends Error {
  constructor(
    message: string,
    public code: "missing_key" | "api_error" | "quota"
  ) {
    super(message);
    this.name = "UsdaError";
  }
}

const USDA_BASE = "https://api.nal.usda.gov/fdc/v1";
const CACHE_TTL = 60 * 60 * 24;

function getApiKey(): string {
  const key = process.env.USDA_API_KEY?.trim();
  if (!key) {
    throw new UsdaError(
      "USDA API key is missing. Please add USDA_API_KEY to your environment variables.",
      "missing_key"
    );
  }
  return key;
}

function nutrientFromFood(
  foodNutrients: Array<{
    nutrientName?: string;
    nutrientNumber?: string;
    value?: number;
    amount?: number;
    nutrient?: { name?: string; number?: string };
  }>,
  names: string[],
  numbers: string[] = []
): number {
  for (const nutrient of foodNutrients) {
    const name = (
      nutrient.nutrientName ||
      nutrient.nutrient?.name ||
      ""
    ).toLowerCase();
    const number =
      nutrient.nutrientNumber || nutrient.nutrient?.number || "";
    const value =
      typeof nutrient.value === "number"
        ? nutrient.value
        : typeof nutrient.amount === "number"
          ? nutrient.amount
          : null;

    if (value == null || !Number.isFinite(value)) continue;

    if (numbers.includes(String(number))) {
      return Math.round(value);
    }

    if (names.some((n) => name.includes(n.toLowerCase()))) {
      return Math.round(value);
    }
  }

  return 0;
}

function extractNutrition(food: {
  foodNutrients?: Array<{
    nutrientName?: string;
    nutrientNumber?: string;
    value?: number;
    amount?: number;
    nutrient?: { name?: string; number?: string };
  }>;
}): RecipeNutrition {
  const nutrients = food.foodNutrients ?? [];

  return {
    calories: nutrientFromFood(nutrients, ["energy", "calorie"], ["208"]),
    protein: nutrientFromFood(nutrients, ["protein"], ["203"]),
    fat: nutrientFromFood(nutrients, ["total lipid", "fat"], ["204"]),
    carbs: nutrientFromFood(
      nutrients,
      ["carbohydrate"],
      ["205"]
    ),
    fiber: nutrientFromFood(nutrients, ["fiber"], ["291"]),
    sodium: nutrientFromFood(nutrients, ["sodium"], ["307"]),
  };
}

async function usdaFetch(
  path: string,
  init?: RequestInit & { query?: Record<string, string> }
): Promise<unknown> {
  const apiKey = getApiKey();
  const url = new URL(`${USDA_BASE}${path}`);
  url.searchParams.set("api_key", apiKey);

  if (init?.query) {
    for (const [key, value] of Object.entries(init.query)) {
      url.searchParams.set(key, value);
    }
  }

  const fetchInit = { ...(init ?? {}) };
  delete (fetchInit as { query?: unknown }).query;

  const response = await fetch(url.toString(), {
    ...fetchInit,
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      (payload as { message?: string; error?: string }).message ||
      (payload as { error?: string }).error ||
      `USDA request failed with ${response.status}`;

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      throw new UsdaError(message, "quota");
    }

    throw new UsdaError(message, "api_error");
  }

  return payload;
}

export async function lookupUsdaNutrition(
  foodQuery: string
): Promise<RecipeNutrition | null> {
  const query = foodQuery.trim().toLowerCase();
  if (!query) return null;

  const cacheId = cacheKey("usda:food", { query });
  const cached = await cacheGet<RecipeNutrition>(cacheId);
  if (cached) {
    return cached;
  }

  const search = (await usdaFetch("/foods/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      pageSize: 5,
      dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"],
    }),
  })) as {
    foods?: Array<{
      fdcId?: number;
      description?: string;
      foodNutrients?: Array<{
        nutrientName?: string;
        nutrientNumber?: string;
        value?: number;
      }>;
    }>;
  };

  const foods = Array.isArray(search.foods) ? search.foods : [];
  if (foods.length === 0) {
    return null;
  }

  let nutrition = extractNutrition(foods[0]);

  if (
    nutrition.calories <= 0 &&
    foods[0]?.fdcId
  ) {
    const detail = (await usdaFetch(`/food/${foods[0].fdcId}`, {
      query: { nutrients: "203,204,205,208,291,307" },
    })) as {
      foodNutrients?: Array<{
        nutrient?: { name?: string; number?: string };
        amount?: number;
      }>;
    };
    nutrition = extractNutrition(detail);
  }

  if (
    nutrition.calories <= 0 &&
    nutrition.protein <= 0 &&
    nutrition.carbs <= 0 &&
    nutrition.fat <= 0
  ) {
    return null;
  }

  await cacheSet(cacheId, nutrition, CACHE_TTL);
  return nutrition;
}

/**
 * Estimates per-serving nutrition by averaging USDA lookups for recipe ingredients.
 * Used when Spoonacular nutrition is incomplete.
 */
export async function estimateRecipeNutritionFromUsda(
  ingredients: string[],
  servings = 1
): Promise<RecipeNutrition | null> {
  const unique = [
    ...new Set(
      ingredients
        .map((item) =>
          item
            .replace(/^\d+[\d/.]*\s*/, "")
            .replace(/\([^)]*\)/g, "")
            .trim()
            .toLowerCase()
        )
        .filter((item) => item.length > 1)
    ),
  ].slice(0, 5);

  if (unique.length === 0) {
    return null;
  }

  const results = await Promise.all(
    unique.map(async (ingredient) => {
      try {
        return await lookupUsdaNutrition(ingredient);
      } catch (err) {
        if (err instanceof UsdaError && err.code === "missing_key") {
          throw err;
        }
        return null;
      }
    })
  );

  const found = results.filter((r): r is RecipeNutrition => r != null);
  if (found.length === 0) {
    return null;
  }

  const sum = found.reduce(
    (acc, n) => ({
      calories: acc.calories + n.calories,
      protein: acc.protein + n.protein,
      fat: acc.fat + n.fat,
      carbs: acc.carbs + n.carbs,
      fiber: (acc.fiber ?? 0) + (n.fiber ?? 0),
      sodium: (acc.sodium ?? 0) + (n.sodium ?? 0),
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, sodium: 0 }
  );

  const divisor = Math.max(servings, 1) * found.length;

  return {
    calories: Math.round(sum.calories / divisor),
    protein: Math.round(sum.protein / divisor),
    fat: Math.round(sum.fat / divisor),
    carbs: Math.round(sum.carbs / divisor),
    fiber: Math.round((sum.fiber ?? 0) / divisor),
    sodium: Math.round((sum.sodium ?? 0) / divisor),
  };
}
