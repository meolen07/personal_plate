import { cleanInstructionStrings } from "@/lib/recipe-display";
import type {
  RankedRecipeRecommendation,
  RecommendedRecipe,
} from "@/lib/types";

/** Detect a Personalized Rank payload (vs AI Suggest RecommendedRecipe). */
export function isRankedRecipeLike(
  value: unknown
): value is RankedRecipeRecommendation {
  if (!value || typeof value !== "object") return false;
  const recipe = value as Record<string, unknown>;
  return (
    typeof recipe.title === "string" &&
    typeof recipe.score === "number" &&
    typeof recipe.reason === "string" &&
    Array.isArray(recipe.matchedIngredients) &&
    // RecommendedRecipe uses image_url; ranked uses image
    typeof recipe.image === "string" &&
    typeof recipe.image_url !== "string"
  );
}

/**
 * Maps a ranked recommendation into the RecommendedRecipe shape stored in
 * `recipes.generated_recipe` so existing saveRecipe / history UI can render it.
 */
export function toRecommendedRecipeFromRanked(
  ranked: RankedRecipeRecommendation
): RecommendedRecipe {
  const matched = ranked.matchedIngredients.filter(Boolean);
  const missing = ranked.missingIngredients.filter(Boolean);
  const fullIngredients = Array.isArray(ranked.ingredients)
    ? ranked.ingredients.filter(
        (ing): ing is string => typeof ing === "string" && Boolean(ing.trim())
      )
    : [];

  // Prefer full recipe lines when available; otherwise matched + missing labels.
  const ingredients =
    fullIngredients.length > 0
      ? fullIngredients
      : [
          ...matched,
          ...missing.map((ing) => `${ing} (needed)`),
        ];

  const cookingSteps = cleanInstructionStrings(ranked.instructions);

  const instructions: string[] =
    cookingSteps.length > 0
      ? cookingSteps
      : [
          ranked.reason.trim()
            ? `Why this matched (score ${ranked.score}/100): ${ranked.reason.trim()}`
            : `Saved from meal suggestions (score ${ranked.score}/100).`,
        ];

  if (cookingSteps.length === 0) {
    if (missing.length > 0) {
      instructions.push(`You'll also need: ${missing.join(", ")}.`);
    }

    if (matched.length > 0) {
      instructions.push(
        `Matched from your ingredients: ${matched.join(", ")}.`
      );
    }
  }

  const hasNutrition =
    ranked.calories > 0 ||
    ranked.protein > 0 ||
    ranked.fat > 0 ||
    ranked.carbs > 0;

  const nutritionParts = hasNutrition
    ? [
        `${Math.round(ranked.calories)} kcal`,
        `Protein ${Math.round(ranked.protein)}g`,
        `Fat ${Math.round(ranked.fat)}g`,
        `Carbs ${Math.round(ranked.carbs)}g`,
      ]
    : ["Nutrition unavailable"];

  return {
    title: ranked.title.trim() || "Untitled ranked recipe",
    description: ranked.reason.trim()
      ? ranked.reason.trim()
      : `Personalized match · score ${ranked.score}/100`,
    image_prompt: "",
    image_url: ranked.image || "",
    servings: 1,
    prep_time_minutes: 0,
    cook_time_minutes:
      Number.isFinite(ranked.readyInMinutes) && ranked.readyInMinutes > 0
        ? Math.round(ranked.readyInMinutes)
        : 0,
    ingredients,
    instructions,
    nutrition_notes: `${nutritionParts.join(" · ")} · Score ${ranked.score}/100`,
    safety_notes: [],
  };
}

/** Normalize either a ranked or already-recommended payload for saveRecipe. */
export function normalizeGeneratedRecipeForSave(
  generated: unknown
): RecommendedRecipe | null {
  if (!generated || typeof generated !== "object") return null;

  if (isRankedRecipeLike(generated)) {
    return toRecommendedRecipeFromRanked(generated);
  }

  const recipe = generated as Partial<RecommendedRecipe>;
  if (typeof recipe.title !== "string" || !recipe.title.trim()) {
    return null;
  }

  return {
    title: recipe.title.trim(),
    description:
      typeof recipe.description === "string" ? recipe.description : "",
    image_prompt:
      typeof recipe.image_prompt === "string" ? recipe.image_prompt : "",
    image_url: typeof recipe.image_url === "string" ? recipe.image_url : "",
    servings:
      typeof recipe.servings === "number" && Number.isFinite(recipe.servings)
        ? recipe.servings
        : 1,
    prep_time_minutes:
      typeof recipe.prep_time_minutes === "number" &&
      Number.isFinite(recipe.prep_time_minutes)
        ? recipe.prep_time_minutes
        : 0,
    cook_time_minutes:
      typeof recipe.cook_time_minutes === "number" &&
      Number.isFinite(recipe.cook_time_minutes)
        ? recipe.cook_time_minutes
        : 0,
    ingredients: Array.isArray(recipe.ingredients)
      ? recipe.ingredients.filter(
          (item): item is string => typeof item === "string"
        )
      : [],
    instructions: Array.isArray(recipe.instructions)
      ? recipe.instructions.filter(
          (item): item is string => typeof item === "string"
        )
      : [],
    nutrition_notes:
      typeof recipe.nutrition_notes === "string" ? recipe.nutrition_notes : "",
    safety_notes: Array.isArray(recipe.safety_notes)
      ? recipe.safety_notes.filter(
          (item): item is string => typeof item === "string"
        )
      : [],
  };
}
