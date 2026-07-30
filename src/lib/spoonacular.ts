import { cacheGet, cacheKey, cacheSet } from "@/lib/cache";
import type {
  Profile,
  RecipeNutrition,
  SpoonacularRecipeCandidate,
} from "@/lib/types";

export class SpoonacularError extends Error {
  constructor(
    message: string,
    public code: "missing_key" | "api_error" | "quota"
  ) {
    super(message);
    this.name = "SpoonacularError";
  }
}

const SPOONACULAR_BASE = "https://api.spoonacular.com";
const SEARCH_CACHE_TTL = 60 * 30;
const DETAIL_CACHE_TTL = 60 * 60;

function getApiKey(): string {
  const key = process.env.SPOONACULAR_API_KEY?.trim();
  if (!key) {
    throw new SpoonacularError(
      "Spoonacular API key is missing. Please add SPOONACULAR_API_KEY to your environment variables.",
      "missing_key"
    );
  }
  return key;
}

function mapDiet(profile: Profile | null): string | undefined {
  const restrictions = (profile?.dietary_restrictions ?? []).map((r) =>
    r.toLowerCase()
  );
  const goals = (profile?.nutrition_goals ?? "").toLowerCase();
  const joined = [...restrictions, goals].join(" ");

  if (joined.includes("vegan")) return "vegan";
  if (joined.includes("vegetarian")) return "vegetarian";
  if (joined.includes("pescatarian") || joined.includes("pescetarian")) {
    return "pescetarian";
  }
  if (joined.includes("keto")) return "ketogenic";
  if (joined.includes("paleo")) return "paleo";
  if (joined.includes("gluten")) return "gluten free";
  return undefined;
}

function mapIntolerances(profile: Profile | null): string | undefined {
  const allergies = (profile?.allergies ?? []).map((a) => a.toLowerCase());
  const mapped: string[] = [];

  for (const allergy of allergies) {
    if (allergy.includes("dairy") || allergy.includes("milk") || allergy.includes("lactose")) {
      mapped.push("dairy");
    } else if (allergy.includes("egg")) {
      mapped.push("egg");
    } else if (allergy.includes("gluten") || allergy.includes("wheat")) {
      mapped.push("gluten");
    } else if (allergy.includes("peanut")) {
      mapped.push("peanut");
    } else if (allergy.includes("tree nut") || allergy.includes("nut")) {
      mapped.push("tree nut");
    } else if (allergy.includes("shellfish") || allergy.includes("shrimp") || allergy.includes("crab")) {
      mapped.push("seafood");
    } else if (allergy.includes("soy")) {
      mapped.push("soy");
    } else if (allergy.includes("sesame")) {
      mapped.push("sesame");
    } else if (allergy.includes("fish")) {
      mapped.push("seafood");
    }
  }

  return mapped.length ? [...new Set(mapped)].join(",") : undefined;
}

function nutrientAmount(
  nutrients: Array<{ name?: string; amount?: number }> | undefined,
  name: string
): number {
  if (!nutrients) return 0;
  const match = nutrients.find(
    (n) => (n.name ?? "").toLowerCase() === name.toLowerCase()
  );
  return typeof match?.amount === "number" && Number.isFinite(match.amount)
    ? Math.round(match.amount)
    : 0;
}

function extractInstructions(recipe: Record<string, unknown>): string[] {
  if (typeof recipe.instructions === "string" && recipe.instructions.trim()) {
    return recipe.instructions
      .replace(/<[^>]+>/g, " ")
      .split(/\r?\n|(?<=\.)\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const analyzed = recipe.analyzedInstructions;
  if (Array.isArray(analyzed) && analyzed[0]) {
    const first = analyzed[0] as { steps?: Array<{ step?: string }> };
    if (Array.isArray(first.steps)) {
      return first.steps
        .map((step) => (typeof step.step === "string" ? step.step.trim() : ""))
        .filter(Boolean);
    }
  }

  return [];
}

function extractIngredients(recipe: Record<string, unknown>): string[] {
  const extended = recipe.extendedIngredients;
  if (Array.isArray(extended)) {
    return extended
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const obj = item as { original?: string; name?: string };
        return (obj.original || obj.name || "").trim();
      })
      .filter(Boolean);
  }
  return [];
}

function extractNutrition(recipe: Record<string, unknown>): RecipeNutrition {
  const nutrition = recipe.nutrition as
    | { nutrients?: Array<{ name?: string; amount?: number }> }
    | undefined;
  const nutrients = nutrition?.nutrients;

  return {
    calories: nutrientAmount(nutrients, "Calories"),
    protein: nutrientAmount(nutrients, "Protein"),
    fat: nutrientAmount(nutrients, "Fat"),
    carbs: nutrientAmount(nutrients, "Carbohydrates"),
    fiber: nutrientAmount(nutrients, "Fiber"),
    sodium: nutrientAmount(nutrients, "Sodium"),
  };
}

function isNutritionIncomplete(nutrition: RecipeNutrition): boolean {
  return (
    nutrition.calories <= 0 &&
    nutrition.protein <= 0 &&
    nutrition.fat <= 0 &&
    nutrition.carbs <= 0
  );
}

function normalizeCandidate(raw: Record<string, unknown>): SpoonacularRecipeCandidate {
  const nutrition = extractNutrition(raw);

  return {
    id: typeof raw.id === "number" ? raw.id : Number(raw.id) || 0,
    title: typeof raw.title === "string" ? raw.title : "Untitled recipe",
    image: typeof raw.image === "string" ? raw.image : "",
    readyInMinutes:
      typeof raw.readyInMinutes === "number" ? raw.readyInMinutes : 0,
    servings: typeof raw.servings === "number" ? raw.servings : 1,
    sourceUrl: typeof raw.sourceUrl === "string" ? raw.sourceUrl : undefined,
    summary: typeof raw.summary === "string" ? raw.summary : undefined,
    cuisines: Array.isArray(raw.cuisines)
      ? raw.cuisines.filter((c): c is string => typeof c === "string")
      : [],
    diets: Array.isArray(raw.diets)
      ? raw.diets.filter((d): d is string => typeof d === "string")
      : [],
    dishTypes: Array.isArray(raw.dishTypes)
      ? raw.dishTypes.filter((d): d is string => typeof d === "string")
      : [],
    ingredients: extractIngredients(raw),
    instructions: extractInstructions(raw),
    nutrition,
    pricePerServing:
      typeof raw.pricePerServing === "number"
        ? Math.round((raw.pricePerServing / 100) * 100) / 100
        : undefined,
    usedIngredientCount:
      typeof raw.usedIngredientCount === "number"
        ? raw.usedIngredientCount
        : undefined,
    missedIngredientCount:
      typeof raw.missedIngredientCount === "number"
        ? raw.missedIngredientCount
        : undefined,
  };
}

async function spoonacularFetch(
  path: string,
  params: Record<string, string | number | undefined>
): Promise<unknown> {
  const apiKey = getApiKey();
  const url = new URL(`${SPOONACULAR_BASE}${path}`);
  url.searchParams.set("apiKey", apiKey);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    status?: string;
    code?: number;
  };

  if (!response.ok) {
    const message =
      payload.message || `Spoonacular request failed with ${response.status}`;
    const lower = message.toLowerCase();

    if (
      response.status === 401 ||
      response.status === 402 ||
      lower.includes("quota") ||
      lower.includes("limit")
    ) {
      throw new SpoonacularError(message, "quota");
    }

    throw new SpoonacularError(message, "api_error");
  }

  return payload;
}

/** Default / clamp for complexSearch — keep lean for recommend latency. */
export const SPOONACULAR_SEARCH_DEFAULT = 20;
export const SPOONACULAR_SEARCH_MIN = 12;
export const SPOONACULAR_SEARCH_MAX = 30;

export function clampSpoonacularSearchNumber(value?: number): number {
  const fallback = value ?? SPOONACULAR_SEARCH_DEFAULT;
  return Math.min(
    Math.max(fallback, SPOONACULAR_SEARCH_MIN),
    SPOONACULAR_SEARCH_MAX
  );
}

export async function searchSpoonacularRecipes(input: {
  ingredients: string[];
  profile: Profile | null;
  number?: number;
  maxReadyTime?: number;
}): Promise<SpoonacularRecipeCandidate[]> {
  const number = clampSpoonacularSearchNumber(input.number);
  const ingredients = input.ingredients
    .map((i) => i.trim().toLowerCase())
    .filter(Boolean);

  if (ingredients.length === 0) {
    return [];
  }

  const diet = mapDiet(input.profile);
  const intolerances = mapIntolerances(input.profile);
  const cuisine = input.profile?.preferred_cuisine?.trim() || undefined;
  const maxCalories = input.profile?.target_calories
    ? Math.round(input.profile.target_calories * 1.35)
    : undefined;
  const minProtein = input.profile?.nutrition_goals
    ?.toLowerCase()
    .includes("protein")
    ? 15
    : undefined;
  const maxPrice = input.profile?.budget_usd
    ? Math.round(input.profile.budget_usd * 100)
    : undefined;

  const cacheId = cacheKey("spoonacular:search", {
    ingredients: [...ingredients].sort(),
    diet,
    intolerances,
    cuisine,
    maxCalories,
    minProtein,
    maxPrice,
    number,
    maxReadyTime: input.maxReadyTime,
  });

  const cached = await cacheGet<SpoonacularRecipeCandidate[]>(cacheId);
  if (cached) {
    return cached;
  }

  const payload = (await spoonacularFetch("/recipes/complexSearch", {
    includeIngredients: ingredients.slice(0, 12).join(","),
    addRecipeInformation: "true",
    fillIngredients: "true",
    addRecipeNutrition: "true",
    instructionsRequired: "true",
    number,
    ranking: 2,
    ignorePantry: "true",
    diet,
    intolerances,
    cuisine,
    maxCalories,
    minProtein,
    maxPrice,
    maxReadyTime: input.maxReadyTime,
    sort: "max-used-ingredients",
  })) as { results?: Record<string, unknown>[] };

  const results = Array.isArray(payload.results) ? payload.results : [];
  const candidates = results
    .map((raw) => normalizeCandidate(raw))
    .filter((c) => c.id > 0 && c.title);

  await cacheSet(cacheId, candidates, SEARCH_CACHE_TTL);
  return candidates;
}

export async function getSpoonacularRecipeById(
  id: number
): Promise<SpoonacularRecipeCandidate | null> {
  const cacheId = cacheKey("spoonacular:detail", { id });
  const cached = await cacheGet<SpoonacularRecipeCandidate>(cacheId);
  if (cached) {
    return cached;
  }

  const payload = (await spoonacularFetch(`/recipes/${id}/information`, {
    includeNutrition: "true",
  })) as Record<string, unknown>;

  const candidate = normalizeCandidate(payload);
  await cacheSet(cacheId, candidate, DETAIL_CACHE_TTL);
  return candidate;
}

export { isNutritionIncomplete };
