import type { Profile, RecipeResponse } from "@/lib/types";

type LooseRecord = Record<string, unknown>;

function getGeminiApiKeys(): string[] {
  return [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_FALLBACK,
    process.env.NEXT_PUBLIC_GEMINI_API_KEY,
  ].filter((value, index, arr): value is string => Boolean(value) && arr.indexOf(value) === index);
}

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

function extractJsonPayload(text: string): string {
  const cleaned = text.replace(/```json\s*|```\s*/g, "").trim();

  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return cleaned.slice(start, end + 1);
    }

    return cleaned;
  }
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().match(/\d+(\.\d+)?/)?.[0];
    if (normalized) {
      const parsed = Number(normalized);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

function asSeverity(value: unknown): "low" | "medium" | "high" {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return "medium";
}

function isRetryableModelError(message: string): boolean {
  const lower = message.toLowerCase();

  return (
    lower.includes("high demand") ||
    lower.includes("temporarily unavailable") ||
    lower.includes("try again later") ||
    lower.includes("service unavailable") ||
    lower.includes("overloaded") ||
    lower.includes("unavailable") ||
    lower.includes("503")
  );
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

export class GeminiError extends Error {
  constructor(
    message: string,
    public code: "missing_key" | "api_error" | "quota" | "invalid_json"
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export async function generateRecipeWithGemini(
  profile: Profile | null,
  availableIngredients: string[],
  optionalNotes?: string
): Promise<RecipeResponse> {
  const apiKeys = getGeminiApiKeys();
  if (apiKeys.length === 0) {
    throw new GeminiError(
      "Gemini API key is missing. Please add GEMINI_API_KEY to your environment variables.",
      "missing_key"
    );
  }

  const modelsToTry = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
  ];

  const prompt = buildPrompt(
    profile,
    availableIngredients,
    optionalNotes
  );

  let text: string | undefined;
  let lastError: unknown;

  for (const apiKey of apiKeys) {
    for (const modelName of modelsToTry) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [{ text: prompt }],
                },
              ],
              generationConfig: {
                responseMimeType: "application/json",
              },
            }),
            cache: "no-store",
          }
        );

        const payload = (await response.json()) as {
          candidates?: Array<{
            content?: {
              parts?: Array<{ text?: string }>;
            };
            finishReason?: string;
          }>;
          error?: {
            code?: number;
            message?: string;
            status?: string;
          };
          promptFeedback?: {
            blockReason?: string;
            blockReasonMessage?: string;
          };
        };

        if (!response.ok) {
          const message =
            payload.error?.message || `Gemini request failed with ${response.status}`;
          throw new Error(message);
        }

        const finishReason = payload.candidates?.[0]?.finishReason;
        if (finishReason && finishReason !== "STOP") {
          throw new Error(`Gemini stopped early: ${finishReason}`);
        }

        const blockReason = payload.promptFeedback?.blockReason;
        if (blockReason) {
          throw new Error(
            payload.promptFeedback?.blockReasonMessage ||
              `Prompt blocked by Gemini: ${blockReason}`
          );
        }

        text = payload.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || "")
          .join("")
          .trim();

        if (!text) {
          throw new Error("Gemini returned an empty response.");
        }

        break;
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : String(err);
        const lower = message.toLowerCase();

        if (
          lower.includes("not found") ||
          lower.includes("404") ||
          lower.includes("is not supported")
        ) {
          continue;
        }

        if (isRetryableModelError(message)) {
          continue;
        }

        if (
          lower.includes("quota") ||
          lower.includes("rate limit") ||
          lower.includes("resource exhausted") ||
          lower.includes("429")
        ) {
          continue;
        }

        if (
          lower.includes("api key not valid") ||
          lower.includes("permission denied") ||
          lower.includes("authentication")
        ) {
          continue;
        }

        throw new GeminiError(
          `Unable to generate recommendations right now. ${message}`,
          "api_error"
        );
      }
    }

    if (text) {
      break;
    }
  }

  if (!text) {
    const message =
      lastError instanceof Error ? lastError.message : String(lastError);
    const lower = message.toLowerCase();

    if (isRetryableModelError(message)) {
      throw new GeminiError(
        "Gemini is currently experiencing high demand across the available models. Please try again in a moment.",
        "api_error"
      );
    }

    if (
      lower.includes("quota") ||
      lower.includes("rate limit") ||
      lower.includes("429")
    ) {
      throw new GeminiError(
        "Gemini API quota has been reached. Please try again later or check your Google AI Studio usage limits.",
        "quota"
      );
    }

    throw new GeminiError(
      `Unable to generate recommendations right now. ${message}`,
      "api_error"
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonPayload(text));
  } catch {
    throw new GeminiError(
      "The AI response could not be processed. Please try again.",
      "invalid_json"
    );
  }

  const normalized = normalizeRecipeResponse(parsed);

  if (!normalized) {
    throw new GeminiError(
      "The AI response could not be processed. Please try again.",
      "invalid_json"
    );
  }

  return normalized;
}
