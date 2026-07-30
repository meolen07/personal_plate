import type { Profile, RecipeResponse } from "@/lib/types";
import {
  GeminiError,
  asNumber,
  asStringArray,
  generateGeminiText,
  parseGeminiJson,
} from "@/lib/gemini-client";

export { GeminiError } from "@/lib/gemini-client";

type LooseRecord = Record<string, unknown>;

function buildPrompt(
  profile: Profile | null,
  availableIngredients: string[],
  optionalNotes?: string
): string {
  const profileContext = profile
    ? `
Patient Profile:
- Name: ${profile.full_name || "Not specified"}
- Age: ${profile.age ?? "Not specified"}
- Gender: ${profile.gender || "Not specified"}
- Height: ${profile.height_cm ? `${profile.height_cm} cm` : "Not specified"}
- Weight: ${profile.weight_kg ? `${profile.weight_kg} kg` : "Not specified"}
- Medical conditions: ${profile.medical_conditions?.join(", ") || "None"}
- Medications: ${profile.medications?.join(", ") || "None"}
- Allergies: ${profile.allergies?.join(", ") || "None"}
- Dietary restrictions: ${profile.dietary_restrictions?.join(", ") || "None"}
- Nutrition goals: ${profile.nutrition_goals || "Not specified"}
- Preferred cuisine: ${profile.preferred_cuisine || "Not specified"}
- Activity level: ${profile.activity_level || "Not specified"}
- Target calories (per meal): ${profile.target_calories ?? "Not specified"}
- Budget (USD per meal): ${profile.budget_usd ?? "Not specified"}
- Preferred foods: ${profile.preferred_foods?.join(", ") || "None"}
- Disliked foods: ${profile.disliked_foods?.join(", ") || "None"}
`
    : "No patient profile available. Provide general safe recommendations.";

  return `You are a clinical nutrition assistant helping patients with personalized, allergy-safe meal recommendations.

${profileContext}

Available ingredients: ${availableIngredients.join(", ")}
${optionalNotes ? `Additional notes: ${optionalNotes}` : ""}

Choose 3 suitable dish options based primarily on the available ingredients and the patient's profile. Prioritize meals that are realistic to make from these ingredients, align with allergies, medical conditions, medications, dietary restrictions, nutrition goals, and preferred cuisine when possible. Make the 3 options meaningfully different from each other. If a risky ingredient appears in the available ingredients, identify it clearly and suggest safer substitutions. It is acceptable to add a few common pantry staples only when necessary, but keep the recipes grounded in the provided ingredients.

Respond with ONLY valid JSON (no markdown, no code fences) matching this exact schema:
{
  "risk_detected": boolean,
  "unsafe_ingredients": [
    {
      "ingredient": "string",
      "reason": "string",
      "severity": "low" | "medium" | "high"
    }
  ],
  "substitutions": [
    {
      "original": "string",
      "substitute": "string",
      "reason": "string"
    }
  ],
  "recommended_recipes": [
    {
      "title": "string",
      "description": "string",
      "image_prompt": "string",
      "servings": number,
      "prep_time_minutes": number,
      "cook_time_minutes": number,
      "ingredients": ["string"],
      "instructions": ["string"],
      "nutrition_notes": "string",
      "safety_notes": ["string"]
    }
  ],
  "warnings": ["string"]
}`;
}

function validateRecipeResponse(data: unknown): data is RecipeResponse {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;

  if (typeof obj.risk_detected !== "boolean") return false;
  if (!Array.isArray(obj.unsafe_ingredients)) return false;
  if (!Array.isArray(obj.substitutions)) return false;
  if (!Array.isArray(obj.warnings)) return false;
  if (!Array.isArray(obj.recommended_recipes) || obj.recommended_recipes.length === 0) {
    return false;
  }

  return obj.recommended_recipes.every((recipe) => {
    if (!recipe || typeof recipe !== "object") return false;
    const r = recipe as Record<string, unknown>;

    return (
      typeof r.title === "string" &&
      typeof r.description === "string" &&
      typeof r.image_prompt === "string" &&
      typeof r.servings === "number" &&
      typeof r.prep_time_minutes === "number" &&
      typeof r.cook_time_minutes === "number" &&
      Array.isArray(r.ingredients) &&
      Array.isArray(r.instructions) &&
      typeof r.nutrition_notes === "string" &&
      Array.isArray(r.safety_notes)
    );
  });
}

function asSeverity(value: unknown): "low" | "medium" | "high" {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return "medium";
}

function normalizeRecipeResponse(data: unknown): RecipeResponse | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const obj = data as LooseRecord;
  const recommendedRecipesRaw = Array.isArray(obj.recommended_recipes)
    ? obj.recommended_recipes
    : [];

  const normalized: RecipeResponse = {
    risk_detected: Boolean(obj.risk_detected),
    unsafe_ingredients: Array.isArray(obj.unsafe_ingredients)
      ? obj.unsafe_ingredients
          .filter((item): item is LooseRecord => Boolean(item && typeof item === "object"))
          .map((item) => ({
            ingredient:
              typeof item.ingredient === "string" ? item.ingredient : "Unknown ingredient",
            reason: typeof item.reason === "string" ? item.reason : "",
            severity: asSeverity(item.severity),
          }))
      : [],
    substitutions: Array.isArray(obj.substitutions)
      ? obj.substitutions
          .filter((item): item is LooseRecord => Boolean(item && typeof item === "object"))
          .map((item) => ({
            original: typeof item.original === "string" ? item.original : "",
            substitute: typeof item.substitute === "string" ? item.substitute : "",
            reason: typeof item.reason === "string" ? item.reason : "",
          }))
          .filter((item) => item.original && item.substitute)
      : [],
    recommended_recipes: recommendedRecipesRaw
      .filter((recipe): recipe is LooseRecord => Boolean(recipe && typeof recipe === "object"))
      .map((recipe) => ({
        title: typeof recipe.title === "string" ? recipe.title : "Suggested recipe",
        description:
          typeof recipe.description === "string" ? recipe.description : "",
        image_prompt:
          typeof recipe.image_prompt === "string"
            ? recipe.image_prompt
            : typeof recipe.title === "string"
              ? recipe.title
              : "A plated healthy meal",
        image_url: "",
        servings: asNumber(recipe.servings),
        prep_time_minutes: asNumber(recipe.prep_time_minutes),
        cook_time_minutes: asNumber(recipe.cook_time_minutes),
        ingredients: asStringArray(recipe.ingredients),
        instructions: asStringArray(recipe.instructions),
        nutrition_notes:
          typeof recipe.nutrition_notes === "string" ? recipe.nutrition_notes : "",
        safety_notes: asStringArray(recipe.safety_notes),
      }))
      .filter(
        (recipe) =>
          Boolean(recipe.title) &&
          recipe.ingredients.length > 0 &&
          recipe.instructions.length > 0
      ),
    warnings: asStringArray(obj.warnings),
  };

  return validateRecipeResponse(normalized) ? normalized : null;
}

export async function generateRecipeWithGemini(
  profile: Profile | null,
  availableIngredients: string[],
  optionalNotes?: string
): Promise<RecipeResponse> {
  const prompt = buildPrompt(profile, availableIngredients, optionalNotes);
  const text = await generateGeminiText({ parts: [{ text: prompt }] });
  const parsed = parseGeminiJson(text);
  const normalized = normalizeRecipeResponse(parsed);

  if (!normalized) {
    throw new GeminiError(
      "The AI response could not be processed. Please try again.",
      "invalid_json"
    );
  }

  return normalized;
}
