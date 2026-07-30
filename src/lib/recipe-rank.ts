import {
  GeminiError,
  asNumber,
  asStringArray,
  generateGeminiText,
  parseGeminiJson,
} from "@/lib/gemini-client";
import { cacheGet, cacheKey, cacheSet } from "@/lib/cache";
import { computeBmi } from "@/lib/bmi";
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

Available ingredients the patient already has:
${availableIngredients.join(", ") || "None listed"}

Candidates (JSON):
${JSON.stringify(candidatePayload)}

Rank the best ${MIN_RESULTS}-${MAX_RESULTS} recipes. Prefer strong ingredient match, allergy/diet safety, nutrition goal fit, reasonable cook time, and budget fit. Hard-avoid known allergens and disliked foods when possible.

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
- score is 0-100 relevance
- index must refer to a candidate index above
- sort recipes by score descending
- return between ${MIN_RESULTS} and ${MAX_RESULTS} items when enough candidates exist
- reason: one concise sentence explaining fit`;
}

function heuristicMatch(
  available: string[],
  ingredients: string[]
): { matched: string[]; missing: string[] } {
  const availableNorm = available.map((a) => a.toLowerCase().trim());
  const matched: string[] = [];
  const missing: string[] = [];

  for (const ingredient of ingredients) {
    const lower = ingredient.toLowerCase();
    const hit = availableNorm.some(
      (a) => lower.includes(a) || a.includes(lower.split(",")[0]?.trim() ?? "")
    );
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

    let score = 50;
    const ingredientRatio =
      candidate.ingredients.length > 0
        ? matched.length / candidate.ingredients.length
        : 0;
    score += Math.round(ingredientRatio * 30);

    const ingredientText = candidate.ingredients.join(" ").toLowerCase();
    const titleLower = candidate.title.toLowerCase();

    for (const allergy of allergies) {
      if (allergy && (ingredientText.includes(allergy) || titleLower.includes(allergy))) {
        score -= 40;
      }
    }

    for (const food of disliked) {
      if (food && (ingredientText.includes(food) || titleLower.includes(food))) {
        score -= 15;
      }
    }

    for (const food of preferred) {
      if (food && (ingredientText.includes(food) || titleLower.includes(food))) {
        score += 8;
      }
    }

    if (targetCalories && candidate.nutrition.calories > 0) {
      const delta = Math.abs(candidate.nutrition.calories - targetCalories);
      score += Math.max(0, 12 - Math.round(delta / 40));
    }

    if (budget != null && candidate.pricePerServing != null) {
      if (candidate.pricePerServing <= budget) {
        score += 8;
      } else {
        score -= 10;
      }
    }

    if (candidate.readyInMinutes > 0 && candidate.readyInMinutes <= 30) {
      score += 5;
    }

    if (
      profile?.preferred_cuisine &&
      candidate.cuisines.some((c) =>
        c.toLowerCase().includes(profile.preferred_cuisine.toLowerCase())
      )
    ) {
      score += 6;
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
      reason: `Matches ${matched.length} available ingredient(s) with score ${score} based on profile fit.`,
      instructions: Array.isArray(candidate.instructions)
        ? candidate.instructions.filter(Boolean)
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

    const fallback = heuristicMatch(availableIngredients, candidate.ingredients);
    const matched = asStringArray(obj.matchedIngredients);
    const missing = asStringArray(obj.missingIngredients);

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
      matchedIngredients: matched.length ? matched : fallback.matched,
      missingIngredients: missing.length ? missing : fallback.missing.slice(0, 12),
      reason:
        typeof obj.reason === "string" && obj.reason.trim()
          ? obj.reason.trim()
          : "Selected as a strong match for your available ingredients and health profile.",
      instructions: Array.isArray(candidate.instructions)
        ? candidate.instructions.filter(Boolean)
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
