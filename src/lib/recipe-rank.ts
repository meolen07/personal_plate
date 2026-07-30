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
/** Cap Gemini / heuristic input — lean shortlist for ranking latency. */
export const RANK_INPUT_LIMIT = 10;
const RANK_INGREDIENT_LIMIT = 12;
/** Soft timeout for Gemini rank; heuristic used on timeout / failure. */
export const RANK_GEMINI_TIMEOUT_MS = 2500;
/** Keep ranking JSON responses small. */
export const RANK_GEMINI_MAX_OUTPUT_TOKENS = 1024;

/** Prefer lighter models first for ranking latency. */
export const RANK_GEMINI_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
] as const;

/**
 * Prefer heuristic ranking on the hot path for latency.
 * Opt into Gemini with `RECOMMEND_RANK_MODE=gemini` (or `ai` / `full`).
 * Empty / heuristic / fast / speed / unknown → heuristic only.
 */
export function isHeuristicRankOnly(): boolean {
  const raw = process.env.RECOMMEND_RANK_MODE?.trim().toLowerCase();
  return raw !== "gemini" && raw !== "ai" && raw !== "full";
}

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

PRIMARY goal (after ≥1 real pantry match): MINIMIZE missing ingredients (shortest shopping list).
Prefer recipes the patient can cook with mostly what they already have.
Sort key: (1) fewest missingIngredients, (2) most matched / highest coverage matched/(matched+missing).
A recipe that matches only 1 pantry item but needs many extras (e.g. 5–12 missing) MUST rank BELOW a recipe with fewer missing items and similar or better matches.
Do NOT recommend "barely related" recipes that force a big grocery trip when better pantry fits exist.

Rank the best ${MIN_RESULTS}-${MAX_RESULTS} recipes. Sort by fewest missing, then highest match count / coverage.
When available ingredients are listed, ONLY include recipes that use at least one of them.
Prefer coverage ≥ ~0.4 and ≤ ~3 missing when alternatives exist (relax to ≤4 / lower coverage only if too few remain).
Secondary (only after ingredient fit / short shopping list): allergy/diet safety, nutrition goal fit, cook time, budget.
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
- score is 0-100 relevance; FEWER missing ingredients and HIGHER match ratio MUST dominate score
- a weak 1-match / many-missing recipe must score well below a solid multi-match / few-missing recipe
- matchedIngredients = candidate ingredients covered by the available list; missingIngredients = ones the patient still needs
- index must refer to a candidate index above
- sort recipes by score descending (best pantry fit / shortest shopping list first)
- return between ${MIN_RESULTS} and ${MAX_RESULTS} items when enough candidates exist
- reason MUST cover BOTH when data allows: (1) pantry — which matchedIngredients from the available list are used, and (2) profile — why it fits this patient (calories vs target, allergens avoided, diet/cuisine, soft nutrition-goal language). Put pantry first, then profile; separate with a newline or " · "
- ONLY mention an available ingredient if it appears in matchedIngredients; never claim a pantry match that is not listed there
- do not invent medical claims; use soft preference language for goals/conditions
- if available ingredients are listed, do not return recipes with empty matchedIngredients`;
}

/** Minimal recipe fields needed to explain profile fit. */
export type RecipeReasonInput = {
  title?: string;
  calories: number;
  protein?: number;
  carbs?: number;
  ingredients?: string[];
  cuisines?: string[];
  diets?: string[];
  pricePerServing?: number;
  sodium?: number;
};

/** Honest pantry-only sentence — never invents pantry hits. */
export function buildPantryReason(
  matched: string[],
  availableCount: number
): string {
  if (availableCount <= 0) {
    return "";
  }
  if (matched.length === 0) {
    return "Limited pantry overlap — you may need most ingredients for this recipe.";
  }

  const names = matched
    .map((m) => ingredientNameCore(m) || m.toLowerCase().trim())
    .filter(Boolean)
    .slice(0, 3);

  if (matched.length === 1) {
    return `Uses ${names[0] ?? "an ingredient"} from your list.`;
  }
  return `Uses ${matched.length} ingredients from your list (${names.join(", ")}).`;
}

function recipeSearchText(recipe: RecipeReasonInput): string {
  return [
    recipe.title ?? "",
    ...(recipe.ingredients ?? []),
    ...(recipe.cuisines ?? []),
    ...(recipe.diets ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

function textMentions(haystack: string, needle: string): boolean {
  const n = needle.toLowerCase().trim();
  if (n.length < 2) return false;
  return haystack.includes(n);
}

/**
 * Pick up to 3 concrete profile-fit signals when data supports them.
 * Soft language only — no medical claims.
 */
export function buildProfileReasonParts(
  recipe: RecipeReasonInput | null,
  profile: Profile | null
): string[] {
  if (!recipe || !profile) return [];

  const parts: string[] = [];
  const text = recipeSearchText(recipe);
  const push = (s: string) => {
    if (parts.length < 3) parts.push(s);
  };

  const target = profile.target_calories;
  if (target != null && target > 0 && recipe.calories > 0) {
    const delta = recipe.calories - target;
    const abs = Math.abs(delta);
    if (abs <= Math.max(75, target * 0.15)) {
      push(`Near your ~${target} kcal meal target`);
    } else if (delta < 0) {
      push(`Under your ~${target} kcal meal target`);
    }
  }

  const allergies = (profile.allergies ?? [])
    .map((a) => a.trim())
    .filter((a) => a.length >= 2);
  if (allergies.length > 0) {
    const avoided = allergies.filter((a) => !textMentions(text, a));
    if (avoided.length === allergies.length) {
      const shown = avoided.slice(0, 2).map((a) => a.toLowerCase());
      push(
        avoided.length === 1
          ? `Avoids your ${shown[0]} allergy`
          : `Avoids your listed allergens (${shown.join(", ")})`
      );
    }
  }

  const cuisine = profile.preferred_cuisine?.trim();
  if (
    cuisine &&
    (recipe.cuisines ?? []).some((c) =>
      c.toLowerCase().includes(cuisine.toLowerCase())
    )
  ) {
    push(`Matches your ${cuisine} cuisine preference`);
  }

  for (const restriction of profile.dietary_restrictions ?? []) {
    const r = restriction.trim();
    if (r.length < 2) continue;
    const rLower = r.toLowerCase();
    const dietHit = (recipe.diets ?? []).some(
      (d) =>
        d.toLowerCase().includes(rLower) || rLower.includes(d.toLowerCase())
    );
    if (dietHit) {
      push(`Fits your ${rLower} preference`);
      break;
    }
  }

  const goals = (profile.nutrition_goals || "").toLowerCase();
  const conditions = (profile.medical_conditions ?? [])
    .join(" ")
    .toLowerCase();
  const goalBlob = `${goals} ${conditions}`;

  if (
    /high[\s-]?protein|more protein|increase protein/.test(goalBlob) &&
    (recipe.protein ?? 0) >= 25
  ) {
    push("Aligns with your high-protein preference");
  } else if (
    /low[\s-]?sodium|less sodium|sodium|hypertension|blood pressure/.test(
      goalBlob
    ) &&
    recipe.sodium != null &&
    recipe.sodium > 0 &&
    recipe.sodium <= 500
  ) {
    push("Aligns with your low-sodium preference");
  } else if (
    /low[\s-]?carb|fewer carb|keto/.test(goalBlob) &&
    (recipe.carbs ?? Infinity) <= 30 &&
    recipe.calories > 0
  ) {
    push("Aligns with your lower-carb preference");
  }

  if (
    profile.budget_usd != null &&
    recipe.pricePerServing != null &&
    recipe.pricePerServing > 0 &&
    recipe.pricePerServing <= profile.budget_usd
  ) {
    push(`Fits your ~$${profile.budget_usd} meal budget`);
  }

  for (const food of profile.preferred_foods ?? []) {
    const f = food.trim();
    if (f.length >= 2 && textMentions(text, f)) {
      push(`Includes ${f.toLowerCase()}, which you prefer`);
      break;
    }
  }

  return parts.slice(0, 3);
}

function composeMatchReason(pantry: string, profileParts: string[]): string {
  const profile = profileParts.join(" · ");
  if (pantry && profile) return `${pantry}\n${profile}`;
  if (pantry) return pantry;
  if (profile) return profile;
  return "Selected as a strong match for your health profile.";
}

/**
 * Honest reason from pantry matches + profile fit signals.
 * `missing` is accepted for API symmetry / future use.
 */
export function buildMatchReason(
  recipe: RecipeReasonInput | null,
  profile: Profile | null,
  matched: string[],
  _missing: string[],
  availableCount: number
): string {
  const pantry = buildPantryReason(matched, availableCount);
  const profileParts = buildProfileReasonParts(recipe, profile);
  return composeMatchReason(pantry, profileParts);
}

function looksLikeProfileReason(text: string): boolean {
  return /\b(calorie|kcal|target|allerg|avoid|cuisine|diet|protein|sodium|budget|prefer|profile|goal|restriction|under your|near your|fits your|aligns with|includes)\b/i.test(
    text
  );
}

/**
 * Keep Gemini prose only when it does not claim pantry matches we did not compute.
 * Rebuilds/preserves profile fit when pantry claims are stripped.
 */
export function reconcileReason(
  geminiReason: string | undefined,
  matched: string[],
  availableCount: number,
  recipe: RecipeReasonInput | null = null,
  profile: Profile | null = null
): string {
  const pantry = buildPantryReason(matched, availableCount);
  const profileParts = buildProfileReasonParts(recipe, profile);
  const heuristic = composeMatchReason(pantry, profileParts);
  const trimmed = geminiReason?.trim();
  if (!trimmed) return heuristic;

  if (availableCount <= 0) {
    if (profileParts.length > 0 && !looksLikeProfileReason(trimmed)) {
      return composeMatchReason("", [...profileParts.slice(0, 2), trimmed]);
    }
    return trimmed;
  }

  const claimsPantryUse =
    /\b(leverage[sd]?|uses?|utilizes?|with your|from your|available|pantry|match(?:es|ed|ing)?|on hand|you have|you already)\b/i.test(
      trimmed
    );

  if (matched.length === 0) {
    if (claimsPantryUse) return heuristic;
    // Gemini spoke about profile only — keep it beside honest pantry line.
    return composeMatchReason(pantry, [trimmed]);
  }

  // Has real matches: keep Gemini, but ensure a profile signal exists when we have one.
  if (profileParts.length > 0 && !looksLikeProfileReason(trimmed)) {
    return `${trimmed}\n${profileParts.join(" · ")}`;
  }
  return trimmed;
}

const UNIT_PATTERN =
  /\b(cups?|tbsps?|tbsp|tsps?|tsp|tablespoons?|teaspoons?|ounces?|oz|pounds?|lbs?|grams?|g|kilograms?|kg|ml|liters?|litres?|cloves?|slices?|pieces?|cans?|packages?|pkgs?|bunches?|heads?|stalks?|pinch(?:es)?|dash(?:es)?|handfuls?|to taste)\b/gi;

/** Size / freshness modifiers that should not drive matching. */
const INGREDIENT_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "with",
  "fresh",
  "large",
  "small",
  "medium",
  "whole",
  "dried",
  "ground",
  "raw",
  "cooked",
  "frozen",
  "organic",
  "boneless",
  "skinless",
  "thin",
  "thick",
  "extra",
  "virgin",
  "optional",
  "plus",
  "more",
  "for",
  "serving",
  "garnish",
  "into",
  "about",
  "approximately",
]);

/** Simple English plural → singular for pantry tokens (zucchini/zucchinis, tomatoes/tomato). */
export function singularizeToken(token: string): string {
  if (token.length < 4) return token;
  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith("oes") && token.length > 4) {
    return token.slice(0, -2);
  }
  if (/(?:ches|shes|xes|zes|ses)$/.test(token) && token.length > 4) {
    return token.slice(0, -2);
  }
  // Keep asparagus / hummus (…us) and couscous (…ss). Do NOT special-case
  // "…is" — that incorrectly blocks zucchinis → zucchini.
  if (token.endsWith("s") && !token.endsWith("ss") && !token.endsWith("us")) {
    return token.slice(0, -1);
  }
  return token;
}

/**
 * Core display/name string: strip leading qty, units, and trailing comma descriptors.
 * "3 Zucchinis, rinsed" → "zucchinis"
 */
export function ingredientNameCore(ingredient: string): string {
  return (ingredient.split(",")[0] ?? ingredient)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/^[\d./\s-]+/, "")
    .replace(
      /\b\d+([\d./]*)?\s*(x|×)?\s*/g,
      " "
    )
    .replace(UNIT_PATTERN, " ")
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokenize an ingredient / pantry string for overlap checks. */
export function ingredientTokens(ingredient: string): string[] {
  const core = ingredientNameCore(ingredient);
  if (!core) return [];
  return core
    .split(/[\s-]+/)
    .map((t) => singularizeToken(t.trim()))
    .filter((t) => t.length >= 2 && !INGREDIENT_STOPWORDS.has(t));
}

function tokenSetContains(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0) return false;
  const set = new Set(haystack);
  return needle.every((t) => set.has(t));
}

/**
 * True when pantry item covers a recipe ingredient (or vice versa on tokens).
 * Uses singularized tokens — not raw substring — to avoid egg→eggplant false positives.
 */
export function ingredientsOverlap(
  available: string,
  ingredient: string
): boolean {
  const availTokens = ingredientTokens(available);
  const recipeTokens = ingredientTokens(ingredient);
  if (availTokens.length === 0 || recipeTokens.length === 0) return false;

  // "chicken" ⊆ "chicken breast"; "zucchini" ≡ "zucchinis";
  // "fresh zucchini" → [zucchini] ⊆ / ⊇ recipe tokens.
  return (
    tokenSetContains(recipeTokens, availTokens) ||
    tokenSetContains(availTokens, recipeTokens)
  );
}

/** matched / (matched + missing). Exported for tests. */
export function matchCoverageRatio(matched: number, missing: number): number {
  const denom = matched + missing;
  return denom > 0 ? matched / denom : 0;
}

/**
 * Soft-filter tiers — prefer few missing + solid coverage; relax gradually
 * so we never return empty when matches exist.
 */
export const SOFT_FILTER_TIERS = [
  { maxMissing: 3, minCoverage: 0.4 },
  { maxMissing: 4, minCoverage: 0.4 },
  { maxMissing: 6, minCoverage: 0.25 },
] as const;

/** Preferred soft-drop thresholds (first tier). */
export const MIN_SOFT_MATCH_RATIO = SOFT_FILTER_TIERS[0].minCoverage;
export const MAX_SOFT_MISSING = SOFT_FILTER_TIERS[0].maxMissing;

type IngredientFitSortable = {
  matchedIngredients: string[];
  missingIngredients: string[];
  score: number;
};

/**
 * Primary sort: fewer missing, then more matched / higher coverage, then score.
 * Exported for tests.
 */
export function compareByIngredientFit(
  a: IngredientFitSortable,
  b: IngredientFitSortable
): number {
  const missDiff = a.missingIngredients.length - b.missingIngredients.length;
  if (missDiff !== 0) return missDiff;

  const matchDiff =
    b.matchedIngredients.length - a.matchedIngredients.length;
  if (matchDiff !== 0) return matchDiff;

  const covA = matchCoverageRatio(
    a.matchedIngredients.length,
    a.missingIngredients.length
  );
  const covB = matchCoverageRatio(
    b.matchedIngredients.length,
    b.missingIngredients.length
  );
  if (covB !== covA) return covB - covA;

  return b.score - a.score;
}

function fitsSoftTier(
  r: RankedRecipeRecommendation,
  tier: { maxMissing: number; minCoverage: number }
): boolean {
  const matched = r.matchedIngredients.length;
  const missing = r.missingIngredients.length;
  if (matched <= 0) return false;
  return (
    missing <= tier.maxMissing &&
    matchCoverageRatio(matched, missing) >= tier.minCoverage
  );
}

/**
 * When the user listed pantry items:
 * 1) Drop 0-match recipes when any match exists.
 * 2) Soft-drop weak fits (many missing / low coverage) when stronger alternatives exist.
 * 3) Relax tiers gradually (≤3 → ≤4 → ≤6 missing) if too few results; never empty.
 * 4) Sort by fewest missing, then matched/coverage, then score.
 * 5) If every candidate is 0-match, keep a few with very low scores + honest reasons.
 */
export function preferIngredientMatches(
  ranked: RankedRecipeRecommendation[],
  availableCount: number,
  profile: Profile | null = null
): RankedRecipeRecommendation[] {
  if (availableCount <= 0 || ranked.length === 0) {
    return ranked.slice(0, MAX_RESULTS);
  }

  const withMatches = ranked.filter((r) => r.matchedIngredients.length > 0);
  if (withMatches.length === 0) {
    return ranked.slice(0, Math.min(MIN_RESULTS, ranked.length)).map((r) => ({
      ...r,
      score: Math.min(r.score, 12),
      reason: buildMatchReason(
        {
          title: r.title,
          calories: r.calories,
          protein: r.protein,
          carbs: r.carbs,
          ingredients: r.ingredients,
        },
        profile,
        [],
        r.missingIngredients,
        availableCount
      ),
    }));
  }

  for (const tier of SOFT_FILTER_TIERS) {
    const filtered = withMatches.filter((r) => fitsSoftTier(r, tier));
    if (filtered.length >= MIN_RESULTS) {
      return [...filtered]
        .sort(compareByIngredientFit)
        .slice(0, MAX_RESULTS);
    }
  }

  // Too few at every tier — keep best matches; never return empty.
  return [...withMatches]
    .sort(compareByIngredientFit)
    .slice(0, MAX_RESULTS);
}

/**
 * Ingredient-fit score 0–100 used by heuristic ranking and to rein in Gemini scores.
 * Coverage dominates; missing count is heavily penalized so 1-match+many-missing loses
 * to multi-match+few-missing, and fewer-missing wins when matched counts are similar.
 */
export function ingredientFitScore(
  matched: string[],
  missing: string[]
): number {
  const m = matched.length;
  const miss = missing.length;
  const coverage = matchCoverageRatio(m, miss);

  // Coverage is the bulk of the score; matched count is a smaller bonus.
  let score = Math.round(coverage * 70);
  score += Math.min(15, m * 3);
  score -= Math.round((1 - coverage) * 15);
  // Steep missing penalty: 3 → −21, 5 → −35, 8+ → −56 capped.
  score -= Math.min(56, miss * 7);
  return Math.max(0, Math.min(100, score));
}

/** Blend Gemini relevance with local pantry-fit so high-missing cannot stay top-ranked. */
export function blendGeminiWithIngredientFit(
  geminiScore: number,
  matched: string[],
  missing: string[],
  availableCount: number
): number {
  let score = Math.max(0, Math.min(100, Math.round(geminiScore)));
  if (availableCount <= 0) return score;

  if (matched.length === 0) {
    return Math.min(score, 12);
  }

  const fit = ingredientFitScore(matched, missing);
  // Pantry fit dominates; Gemini may only nudge nutrition/profile preferences.
  score = Math.round(fit * 0.82 + score * 0.18);

  const coverage = matchCoverageRatio(matched.length, missing.length);
  if (coverage < MIN_SOFT_MATCH_RATIO) {
    score = Math.min(score, 32);
  }
  if (missing.length > MAX_SOFT_MISSING) {
    score = Math.min(score, 36);
  }

  return Math.max(0, Math.min(100, score));
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

    // PRIMARY signal: coverage + matched count − heavy missing penalty.
    let score = ingredientFitScore(matched, missing);

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

    // Bury true zero-match candidates when the user listed pantry items.
    if (availableIngredients.length > 0 && matched.length === 0) {
      score = Math.min(score, 12);
    }

    score = Math.max(0, Math.min(100, score));

    const reasonInput: RecipeReasonInput = {
      title: candidate.title,
      calories: candidate.nutrition.calories,
      protein: candidate.nutrition.protein,
      carbs: candidate.nutrition.carbs,
      ingredients: candidate.ingredients,
      cuisines: candidate.cuisines,
      diets: candidate.diets,
      pricePerServing: candidate.pricePerServing,
      sodium: candidate.nutrition.sodium,
    };

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
      reason: buildMatchReason(
        reasonInput,
        profile,
        matched,
        missing,
        availableIngredients.length
      ),
      instructions: cleanInstructionStrings(candidate.instructions),
      ingredients: Array.isArray(candidate.ingredients)
        ? candidate.ingredients.filter(Boolean)
        : [],
    } satisfies RankedRecipeRecommendation;
  });

  return preferIngredientMatches(
    scored.sort(compareByIngredientFit),
    availableIngredients.length,
    profile
  );
}

function normalizeRanked(
  data: unknown,
  candidates: SpoonacularRecipeCandidate[],
  availableIngredients: string[],
  profile: Profile | null
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

    const score = blendGeminiWithIngredientFit(
      asNumber(obj.score),
      matched,
      missing,
      availableIngredients.length
    );

    const geminiReason =
      typeof obj.reason === "string" && obj.reason.trim()
        ? obj.reason.trim()
        : undefined;

    const reasonInput: RecipeReasonInput = {
      title: candidate.title,
      calories: candidate.nutrition.calories,
      protein: candidate.nutrition.protein,
      carbs: candidate.nutrition.carbs,
      ingredients: candidate.ingredients,
      cuisines: candidate.cuisines,
      diets: candidate.diets,
      pricePerServing: candidate.pricePerServing,
      sodium: candidate.nutrition.sodium,
    };

    ranked.push({
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
      reason: reconcileReason(
        geminiReason,
        matched,
        availableIngredients.length,
        reasonInput,
        profile
      ),
      instructions: cleanInstructionStrings(candidate.instructions),
      ingredients: Array.isArray(candidate.ingredients)
        ? candidate.ingredients.filter(Boolean)
        : [],
    });
  }

  if (ranked.length === 0) return null;

  return preferIngredientMatches(
    ranked.sort(compareByIngredientFit),
    availableIngredients.length,
    profile
  );
}

/**
 * Overlay fresh candidate nutrition / missing detail onto cached ranks so
 * stale zero-macro gemini:rank entries do not hide Spoonacular/USDA backfill.
 */
export function rehydrateRankedFromCandidates(
  ranked: RankedRecipeRecommendation[],
  candidates: SpoonacularRecipeCandidate[]
): RankedRecipeRecommendation[] {
  const byId = new Map(candidates.map((c) => [c.id, c]));

  return ranked.map((recipe) => {
    const candidate = byId.get(recipe.id);
    if (!candidate) return recipe;

    return {
      ...recipe,
      calories: candidate.nutrition.calories,
      protein: candidate.nutrition.protein,
      fat: candidate.nutrition.fat,
      carbs: candidate.nutrition.carbs,
      instructions:
        recipe.instructions.length > 0
          ? recipe.instructions
          : cleanInstructionStrings(candidate.instructions),
      ingredients:
        recipe.ingredients && recipe.ingredients.length > 0
          ? recipe.ingredients
          : candidate.ingredients,
    };
  });
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
    // Bust ranks cached with empty macros before nutrition backfill.
    nutritionV: 3,
  });

  const cached = await cacheGet<RankedRecipeRecommendation[]>(cacheId);
  if (cached?.length) {
    return rehydrateRankedFromCandidates(cached, candidates);
  }

  const limitedCandidates = candidates.slice(0, RANK_INPUT_LIMIT);

  const runHeuristic = async () => {
    const heuristic = rankRecipesHeuristically(
      profile,
      availableIngredients,
      limitedCandidates
    );
    await cacheSet(cacheId, heuristic, RANK_CACHE_TTL);
    return heuristic;
  };

  if (isHeuristicRankOnly()) {
    return runHeuristic();
  }

  try {
    const text = await generateGeminiText({
      models: RANK_GEMINI_MODELS,
      timeoutMs: RANK_GEMINI_TIMEOUT_MS,
      maxOutputTokens: RANK_GEMINI_MAX_OUTPUT_TOKENS,
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
      availableIngredients,
      profile
    );

    if (ranked && ranked.length > 0) {
      await cacheSet(cacheId, ranked, RANK_CACHE_TTL);
      return ranked;
    }
  } catch (err) {
    if (err instanceof GeminiError && err.code === "missing_key") {
      throw err;
    }
    // Fall through to heuristic ranking for transient AI failures / timeouts
  }

  return runHeuristic();
}

/** @deprecated Use rankRecipesHeuristically — alias kept for test compatibility. */
export const heuristicRank = rankRecipesHeuristically;
