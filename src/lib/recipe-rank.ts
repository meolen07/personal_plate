import {
  GeminiError,
  asNumber,
  generateGeminiText,
  parseGeminiJson,
} from "@/lib/gemini-client";
import { cacheGet, cacheKey, cacheSet } from "@/lib/cache";
import { computeBmi } from "@/lib/bmi";
import { cleanInstructionStrings } from "@/lib/recipe-display";
import type {
  Profile,
  RankedRecipeRecommendation,
  SpoonacularRecipeCandidate,
} from "@/lib/types";

const RANK_CACHE_TTL = 60 * 20;
const MIN_RESULTS = 6;
const MAX_RESULTS = 10;
/** Cap Gemini / heuristic input — matches lean Spoonacular search size. */
export const RANK_INPUT_LIMIT = 20;
const RANK_INGREDIENT_LIMIT = 12;

/** Prefer lighter models first for ranking latency. */
export const RANK_GEMINI_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
] as const;

function buildRankingPrompt(
  profile: Profile | null,
  availableIngredients: string[],
  candidates: SpoonacularRecipeCandidate[]
): string {
  const bmi = computeBmi(profile?.height_cm, profile?.weight_kg);

  const profileContext = profile
    ? `
Patient Profile:
- Age: ${profile.age ?? "Not specified"}
- Gender: ${profile.gender || "Not specified"}
- BMI: ${bmi.bmi != null ? `${bmi.bmi} (${bmi.label})` : "Not specified"}
- Activity level: ${profile.activity_level || "Not specified"}
- Medical conditions: ${profile.medical_conditions?.join(", ") || "None"}
- Medications: ${profile.medications?.join(", ") || "None"}
- Allergies: ${profile.allergies?.join(", ") || "None"}
- Dietary restrictions: ${profile.dietary_restrictions?.join(", ") || "None"}
- Nutrition goals: ${profile.nutrition_goals || "Not specified"}
- Preferred cuisine: ${profile.preferred_cuisine || "Not specified"}
- Target calories (per meal): ${profile.target_calories ?? "Not specified"}
- Budget (USD per meal): ${profile.budget_usd ?? "Not specified"}
- Preferred foods: ${profile.preferred_foods?.join(", ") || "None"}
- Disliked foods: ${profile.disliked_foods?.join(", ") || "None"}
`
    : "No patient profile available.";

  const candidatePayload = candidates.map((c, index) => ({
    index,
    id: c.id,
    title: c.title,
    readyInMinutes: c.readyInMinutes,
    calories: c.nutrition.calories,
    protein: c.nutrition.protein,
    fat: c.nutrition.fat,
    carbs: c.nutrition.carbs,
    fiber: c.nutrition.fiber,
    sodium: c.nutrition.sodium,
    ingredients: c.ingredients.slice(0, RANK_INGREDIENT_LIMIT),
    cuisines: c.cuisines,
    diets: c.diets,
    pricePerServing: c.pricePerServing,
  }));

  return `You are a clinical nutrition ranking assistant. Rank recipe candidates for this patient.

${profileContext}

Available ingredients the patient already has (PRIORITY SIGNAL):
${availableIngredients.join(", ") || "None listed"}

Candidates (JSON):
${JSON.stringify(candidatePayload)}

PRIMARY goal: maximize use of available ingredients and minimize missing/shopping items.
Rank the best ${MIN_RESULTS}-${MAX_RESULTS} recipes. Sort best ingredient match first.
Secondary (only after ingredient fit): allergy/diet safety, nutrition goal fit, cook time, budget.
Hard-avoid known allergens and disliked foods when possible.

Return ONLY valid JSON:
{
  "recipes": [
    {
      "index": number,
      "score": number,
      "matchedIngredients": ["string"],
      "missingIngredients": ["string"],
      "reason": "string"
    }
  ]
}

Rules:
- score is 0-100 relevance; recipes that use MORE of the available ingredients and need FEWER missing ingredients MUST score higher
- matchedIngredients = candidate ingredients covered by the available list; missingIngredients = ones the patient still needs
- index must refer to a candidate index above
- sort recipes by score descending (best available-ingredient match first)
- return between ${MIN_RESULTS} and ${MAX_RESULTS} items when enough candidates exist
- reason: one concise sentence; mention ingredient match when relevant`;
}

/** Strip amounts/units so "2 cups chicken breast" aligns with "chicken". */
function ingredientNameCore(ingredient: string): string {
  return (ingredient.split(",")[0] ?? ingredient)
    .toLowerCase()
    .replace(/^[\d./\s-]+/, "")
    .replace(
      /\b(cups?|tbsps?|tbsp|tsps?|tsp|tablespoons?|teaspoons?|ounces?|oz|pounds?|lbs?|grams?|kilograms?|kg|ml|liters?|litres?|cloves?|slices?|pieces?|pinch(?:es)?|dash(?:es)?|to taste)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function ingredientsOverlap(available: string, ingredient: string): boolean {
  const a = available.toLowerCase().trim();
  const core = ingredientNameCore(ingredient);
  if (!a || !core) return false;
  return core.includes(a) || a.includes(core);
}

/** Exported for tests — matched vs missing against the available pantry list. */
export function heuristicMatch(
  available: string[],
  ingredients: string[]
): { matched: string[]; missing: string[] } {
  const availableNorm = available
    .map((a) => a.toLowerCase().trim())
    .filter(Boolean);
  const matched: string[] = [];
  const missing: string[] = [];

  for (const ingredient of ingredients) {
    const hit = availableNorm.some((a) => ingredientsOverlap(a, ingredient));
    if (hit) {
      matched.push(ingredient);
    } else {
      missing.push(ingredient);
    }
  }

  return { matched, missing };
}

/** Deterministic ranking used when Gemini ranking is unavailable. Exported for tests. */
export function rankRecipesHeuristically(
  profile: Profile | null,
  availableIngredients: string[],
  candidates: SpoonacularRecipeCandidate[]
): RankedRecipeRecommendation[] {
  const allergies = (profile?.allergies ?? []).map((a) => a.toLowerCase());
  const disliked = (profile?.disliked_foods ?? []).map((d) => d.toLowerCase());
  const preferred = (profile?.preferred_foods ?? []).map((p) => p.toLowerCase());
  const targetCalories = profile?.target_calories;
  const budget = profile?.budget_usd;

  const scored = candidates.map((candidate) => {
    const { matched, missing } = heuristicMatch(
      availableIngredients,
      candidate.ingredients
    );

    const totalIngredients = candidate.ingredients.length;
    const matchRatio =
      totalIngredients > 0 ? matched.length / totalIngredients : 0;
    const missingRatio =
      totalIngredients > 0 ? missing.length / totalIngredients : 1;

    // PRIMARY signal: maximize matched / minimize missing (up to ~70 pts).
    let score = Math.round(matchRatio * 50);
    score += Math.min(15, matched.length * 3);
    score -= Math.round(missingRatio * 15);
    score -= Math.min(12, missing.length);

    const ingredientText = candidate.ingredients.join(" ").toLowerCase();
    const titleLower = candidate.title.toLowerCase();

    // SECONDARY: profile safety and fit (smaller weights).
    for (const allergy of allergies) {
      if (allergy && (ingredientText.includes(allergy) || titleLower.includes(allergy))) {
        score -= 40;
      }
    }

    for (const food of disliked) {
      if (food && (ingredientText.includes(food) || titleLower.includes(food))) {
        score -= 10;
      }
    }

    for (const food of preferred) {
      if (food && (ingredientText.includes(food) || titleLower.includes(food))) {
        score += 5;
      }
    }

    if (targetCalories && candidate.nutrition.calories > 0) {
      const delta = Math.abs(candidate.nutrition.calories - targetCalories);
      score += Math.max(0, 8 - Math.round(delta / 50));
    }

    if (budget != null && candidate.pricePerServing != null) {
      if (candidate.pricePerServing <= budget) {
        score += 5;
      } else {
        score -= 8;
      }
    }

    if (candidate.readyInMinutes > 0 && candidate.readyInMinutes <= 30) {
      score += 3;
    }

    if (
      profile?.preferred_cuisine &&
      candidate.cuisines.some((c) =>
        c.toLowerCase().includes(profile.preferred_cuisine.toLowerCase())
      )
    ) {
      score += 4;
    }

    score = Math.max(0, Math.min(100, score));

    return {
      id: candidate.id,
      title: candidate.title,
      image: candidate.image,
      score,
      calories: candidate.nutrition.calories,
      protein: candidate.nutrition.protein,
      fat: candidate.nutrition.fat,
      carbs: candidate.nutrition.carbs,
      readyInMinutes: candidate.readyInMinutes,
      matchedIngredients: matched,
      missingIngredients: missing.slice(0, 12),
      reason: `Uses ${matched.length}/${totalIngredients || matched.length} available ingredient(s); ${missing.length} missing.`,
      instructions: cleanInstructionStrings(candidate.instructions),
      ingredients: Array.isArray(candidate.ingredients)
        ? candidate.ingredients.filter(Boolean)
        : [],
    } satisfies RankedRecipeRecommendation;
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS);
}

function normalizeRanked(
  data: unknown,
  candidates: SpoonacularRecipeCandidate[],
  availableIngredients: string[]
): RankedRecipeRecommendation[] | null {
  if (!data || typeof data !== "object") return null;
  const recipesRaw = (data as { recipes?: unknown }).recipes;
  if (!Array.isArray(recipesRaw) || recipesRaw.length === 0) return null;

  const ranked: RankedRecipeRecommendation[] = [];

  for (const item of recipesRaw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const index = asNumber(obj.index);
    const candidate = candidates[index];
    if (!candidate) continue;

    // Always recompute matched/missing locally for accuracy (Gemini may drift).
    const { matched, missing } = heuristicMatch(
      availableIngredients,
      candidate.ingredients
    );

    ranked.push({
      id: candidate.id,
      title: candidate.title,
      image: candidate.image,
      score: Math.max(0, Math.min(100, Math.round(asNumber(obj.score)))),
      calories: candidate.nutrition.calories,
      protein: candidate.nutrition.protein,
      fat: candidate.nutrition.fat,
      carbs: candidate.nutrition.carbs,
      readyInMinutes: candidate.readyInMinutes,
      matchedIngredients: matched,
      missingIngredients: missing.slice(0, 12),
      reason:
        typeof obj.reason === "string" && obj.reason.trim()
          ? obj.reason.trim()
          : "Selected as a strong match for your available ingredients and health profile.",
      instructions: cleanInstructionStrings(candidate.instructions),
      ingredients: Array.isArray(candidate.ingredients)
        ? candidate.ingredients.filter(Boolean)
        : [],
    });
  }

  if (ranked.length === 0) return null;

  return ranked
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS);
}

export async function rankRecipeCandidates(input: {
  profile: Profile | null;
  availableIngredients: string[];
  candidates: SpoonacularRecipeCandidate[];
}): Promise<RankedRecipeRecommendation[]> {
  const { profile, availableIngredients, candidates } = input;

  if (candidates.length === 0) {
    return [];
  }

  const cacheId = cacheKey("gemini:rank", {
    ingredients: [...availableIngredients].map((i) => i.toLowerCase()).sort(),
    candidateIds: candidates.map((c) => c.id),
    profile: profile
      ? {
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
        }
      : null,
  });

  const cached = await cacheGet<RankedRecipeRecommendation[]>(cacheId);
  if (cached) {
    return cached;
  }

  const limitedCandidates = candidates.slice(0, RANK_INPUT_LIMIT);

  try {
    const text = await generateGeminiText({
      models: RANK_GEMINI_MODELS,
      parts: [
        {
          text: buildRankingPrompt(
            profile,
            availableIngredients,
            limitedCandidates
          ),
        },
      ],
    });
    const parsed = parseGeminiJson(text);
    const ranked = normalizeRanked(
      parsed,
      limitedCandidates,
      availableIngredients
    );

    if (ranked && ranked.length > 0) {
      await cacheSet(cacheId, ranked, RANK_CACHE_TTL);
      return ranked;
    }
  } catch (err) {
    if (err instanceof GeminiError && err.code === "missing_key") {
      throw err;
    }
    // Fall through to heuristic ranking for transient AI failures
  }

  const heuristic = rankRecipesHeuristically(
    profile,
    availableIngredients,
    limitedCandidates
  );
  await cacheSet(cacheId, heuristic, RANK_CACHE_TTL);
  return heuristic;
}

/** @deprecated Use rankRecipesHeuristically — alias kept for test compatibility. */
export const heuristicRank = rankRecipesHeuristically;
