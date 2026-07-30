import { cacheGet, cacheKey, cacheSet } from "@/lib/cache";
import { cleanInstructionStrings } from "@/lib/recipe-display";
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

/** Parse Spoonacular nutrient amounts (number or strings like "20g" / "584.3"). */
function parseNutrientValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const match = value.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
    if (match) {
      const parsed = Number(match[0]);
      if (Number.isFinite(parsed)) return Math.round(parsed);
    }
  }
  return 0;
}

function nutrientAmount(
  nutrients: Array<{ name?: string; amount?: unknown }> | undefined,
  names: string[]
): number {
  if (!nutrients?.length) return 0;
  const targets = names.map((n) => n.toLowerCase());
  const exact = nutrients.find((n) =>
    targets.includes((n.name ?? "").toLowerCase())
  );
  if (exact) return parseNutrientValue(exact.amount);
  return 0;
}

function extractInstructions(recipe: Record<string, unknown>): string[] {
  let raw: string[] = [];

  if (typeof recipe.instructions === "string" && recipe.instructions.trim()) {
    raw = recipe.instructions
      .replace(/<[^>]+>/g, " ")
      .split(/\r?\n|(?<=\.)\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  } else {
    const analyzed = recipe.analyzedInstructions;
    if (Array.isArray(analyzed) && analyzed[0]) {
      const first = analyzed[0] as { steps?: Array<{ step?: string }> };
      if (Array.isArray(first.steps)) {
        raw = first.steps
          .map((step) =>
            typeof step.step === "string" ? step.step.trim() : ""
          )
          .filter(Boolean);
      }
    }
  }

  return cleanInstructionStrings(raw);
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

/**
 * Map Spoonacular nutrition from nested `nutrition.nutrients` and/or flat
 * top-level calorie/macro fields used by some search shapes.
 */
export function extractSpoonacularNutrition(
  recipe: Record<string, unknown>
): RecipeNutrition {
  const nutrition = recipe.nutrition as
    | { nutrients?: Array<{ name?: string; amount?: unknown }> }
    | undefined;
  const nutrients = nutrition?.nutrients;

  const fromNutrients: RecipeNutrition = {
    calories: nutrientAmount(nutrients, ["Calories", "Energy"]),
    protein: nutrientAmount(nutrients, ["Protein"]),
    fat: nutrientAmount(nutrients, ["Fat", "Total Fat", "Total lipid"]),
    carbs: nutrientAmount(nutrients, [
      "Carbohydrates",
      "Carbohydrate",
      "Net Carbohydrates",
      "Carbs",
    ]),
    fiber: nutrientAmount(nutrients, ["Fiber", "Fiber, total dietary"]),
    sodium: nutrientAmount(nutrients, ["Sodium"]),
  };

  if (!isNutritionIncomplete(fromNutrients)) {
    return fromNutrients;
  }

  // Flat fields (e.g. findByNutrients-style or partial search payloads).
  return {
    calories:
      parseNutrientValue(recipe.calories) || fromNutrients.calories,
    protein: parseNutrientValue(recipe.protein) || fromNutrients.protein,
    fat: parseNutrientValue(recipe.fat) || fromNutrients.fat,
    carbs:
      parseNutrientValue(recipe.carbs) ||
      parseNutrientValue(recipe.carbohydrates) ||
      fromNutrients.carbs,
    fiber: fromNutrients.fiber,
    sodium: fromNutrients.sodium,
  };
}

export function isNutritionIncomplete(nutrition: RecipeNutrition): boolean {
  return (
    nutrition.calories <= 0 &&
    nutrition.protein <= 0 &&
    nutrition.fat <= 0 &&
    nutrition.carbs <= 0
  );
}

function normalizeCandidate(raw: Record<string, unknown>): SpoonacularRecipeCandidate {
  const nutrition = extractSpoonacularNutrition(raw);

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
export const SPOONACULAR_SEARCH_DEFAULT = 12;
export const SPOONACULAR_SEARCH_MIN = 10;
export const SPOONACULAR_SEARCH_MAX = 30;
/** Cap ingredients sent to Spoonacular includeIngredients (main items only). */
export const SPOONACULAR_INGREDIENT_LIMIT = 8;

/**
 * Common pantry staples that dilute Spoonacular search when the list is long.
 * Matching uses a normalized core name (lowercase, no qty/units fluff).
 */
const PANTRY_NOISE_NAMES = new Set([
  "salt",
  "kosher salt",
  "sea salt",
  "pepper",
  "black pepper",
  "white pepper",
  "ground pepper",
  "oil",
  "olive oil",
  "vegetable oil",
  "canola oil",
  "cooking oil",
  "sesame oil",
  "water",
  "sugar",
  "brown sugar",
  "white sugar",
  "powdered sugar",
  "garlic powder",
  "onion powder",
  "chili powder",
  "paprika",
  "cumin",
  "baking soda",
  "baking powder",
  "flour",
  "all purpose flour",
  "cornstarch",
  "corn starch",
  "vinegar",
  "soy sauce",
  "butter",
]);

function normalizeIngredientForNoiseCheck(ingredient: string): string {
  return ingredient
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/^[\d./\s-]+/, "")
    .replace(/\b\d+([\d./]*)?\s*/g, " ")
    .replace(
      /\b(cups?|tbsps?|tbsp|tsps?|tsp|tablespoons?|teaspoons?|ounces?|oz|pounds?|lbs?|grams?|g|ml|pinch(?:es)?|dash(?:es)?|to taste)\b/gi,
      " "
    )
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPantryNoiseIngredient(ingredient: string): boolean {
  const core = normalizeIngredientForNoiseCheck(ingredient);
  if (!core) return true;
  if (PANTRY_NOISE_NAMES.has(core)) return true;
  // Single-token staples like "salt", "oil", "water", "sugar", "pepper"
  if (
    core === "salt" ||
    core === "pepper" ||
    core === "oil" ||
    core === "water" ||
    core === "sugar" ||
    core === "flour" ||
    core === "butter" ||
    core === "vinegar"
  ) {
    return true;
  }
  return false;
}

/**
 * Prefer distinctive “main” ingredients for Spoonacular search.
 * Drops pantry noise when the list is long; caps at ~6–8 items.
 * Callers should still rank matched/missing against the full pantry list.
 */
export function trimIngredientsForSpoonacularSearch(
  ingredients: string[],
  limit = SPOONACULAR_INGREDIENT_LIMIT
): string[] {
  const cleaned = ingredients
    .map((i) => i.trim())
    .filter(Boolean);

  if (cleaned.length === 0) return [];

  const cap = Math.min(Math.max(limit, 6), 8);
  const main = cleaned.filter((i) => !isPantryNoiseIngredient(i));
  const noise = cleaned.filter((i) => isPantryNoiseIngredient(i));

  // Prefer mains; if too few, fill with noise so search still has signal.
  const preferred =
    main.length > 0 ? [...main, ...noise] : cleaned;

  // When the list is short, keep everything (still capped).
  if (cleaned.length <= cap) {
    return preferred.slice(0, cap);
  }

  // Long list: drop noise first, then take top mains.
  const trimmed = (main.length >= 4 ? main : preferred).slice(0, cap);
  return trimmed.length > 0 ? trimmed : cleaned.slice(0, cap);
}

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
  const ingredients = trimIngredientsForSpoonacularSearch(
    input.ingredients.map((i) => i.trim().toLowerCase()).filter(Boolean)
  );

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
    ranking: 1,
    sort: "max-used-ingredients",
    // Bust caches that may have been stored without nutrition payloads.
    addRecipeNutrition: true,
    nutritionV: 2,
  });

  const cached = await cacheGet<SpoonacularRecipeCandidate[]>(cacheId);
  if (cached) {
    return cached;
  }

  const payload = (await spoonacularFetch("/recipes/complexSearch", {
    includeIngredients: ingredients.join(","),
    addRecipeInformation: "true",
    fillIngredients: "true",
    addRecipeNutrition: "true",
    instructionsRequired: "true",
    number,
    // Maximize used pantry ingredients (aligns with sort below).
    ranking: 1,
    // Ignore oil/salt/water etc. in Spoonacular's used/missed counts so staples
    // do not inflate "missing" and drown out real grocery gaps.
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
    .filter((c) => c.id > 0 && c.title)
    // Prefer fewer extras when API used/missed counts are present (soft local sort).
    .sort((a, b) => {
      const usedA = a.usedIngredientCount ?? 0;
      const usedB = b.usedIngredientCount ?? 0;
      if (usedB !== usedA) return usedB - usedA;
      const missA = a.missedIngredientCount ?? Number.POSITIVE_INFINITY;
      const missB = b.missedIngredientCount ?? Number.POSITIVE_INFINITY;
      return missA - missB;
    });

  await cacheSet(cacheId, candidates, SEARCH_CACHE_TTL);
  return candidates;
}

export async function getSpoonacularRecipeById(
  id: number
): Promise<SpoonacularRecipeCandidate | null> {
  const cacheId = cacheKey("spoonacular:detail", {
    id,
    includeNutrition: true,
    nutritionV: 2,
  });
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

/**
 * When complexSearch nutrition is missing/zero, pull Get Recipe Information
 * (includeNutrition) for a small top set — prefers Spoonacular over USDA.
 */
export const SPOONACULAR_NUTRITION_BACKFILL_MAX = 6;

export async function backfillIncompleteNutritionFromSpoonacular(
  candidates: SpoonacularRecipeCandidate[],
  limit = SPOONACULAR_NUTRITION_BACKFILL_MAX
): Promise<SpoonacularRecipeCandidate[]> {
  const needsBackfill = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => isNutritionIncomplete(candidate.nutrition))
    .slice(0, Math.max(0, limit));

  if (needsBackfill.length === 0) {
    return candidates;
  }

  const filledByIndex = new Map<number, SpoonacularRecipeCandidate>();

  await Promise.all(
    needsBackfill.map(async ({ candidate, index }) => {
      try {
        const detail = await getSpoonacularRecipeById(candidate.id);
        if (!detail || isNutritionIncomplete(detail.nutrition)) {
          return;
        }
        filledByIndex.set(index, {
          ...candidate,
          nutrition: detail.nutrition,
          ingredients:
            candidate.ingredients.length > 0
              ? candidate.ingredients
              : detail.ingredients,
          instructions:
            candidate.instructions.length > 0
              ? candidate.instructions
              : detail.instructions,
        });
      } catch {
        // Keep original candidate; USDA may still gap-fill if enabled.
      }
    })
  );

  if (filledByIndex.size === 0) {
    return candidates;
  }

  return candidates.map(
    (candidate, index) => filledByIndex.get(index) ?? candidate
  );
}
