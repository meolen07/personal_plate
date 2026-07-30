import {
  GeminiError,
  asNumber,
  asStringArray,
  generateGeminiText,
  parseGeminiJson,
} from "@/lib/gemini-client";
import type {
  DetectedIngredient,
  IngredientDetectionResult,
} from "@/lib/types";

export const ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export type AllowedVideoMimeType = (typeof ALLOWED_VIDEO_MIME_TYPES)[number];

const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

const DETECTION_PROMPT = `You are a kitchen vision assistant. Analyze this short cooking/fridge video and extract what you can see.

Return ONLY valid JSON (no markdown) matching this exact schema:
{
  "ingredients": [
    {
      "name": "string",
      "estimated_quantity": "string",
      "confidence": number
    }
  ],
  "cooking_method": "string",
  "kitchen_tools": ["string"]
}

Rules:
- ingredients: edible food items visible or clearly implied; name in common culinary English
- estimated_quantity: best-effort amount (e.g. "2 pieces", "about 200g", "1 bunch"); use "unknown" if unclear
- confidence: 0 to 1 for each ingredient
- cooking_method: primary technique if observable (e.g. "stir-fry", "boiling", "none visible")
- kitchen_tools: cookware/utensils visible (e.g. "wok", "knife", "cutting board")
- If nothing is visible, return empty arrays and cooking_method "none visible"`;

function normalizeConfidence(value: unknown): number {
  const n = asNumber(value);
  if (n > 1 && n <= 100) {
    return Math.round((n / 100) * 100) / 100;
  }
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}

export function normalizeDetection(data: unknown): IngredientDetectionResult {
  if (!data || typeof data !== "object") {
    throw new GeminiError(
      "The AI response could not be processed. Please try again.",
      "invalid_json"
    );
  }

  const obj = data as Record<string, unknown>;
  const ingredientsRaw = Array.isArray(obj.ingredients) ? obj.ingredients : [];

  const ingredients: DetectedIngredient[] = ingredientsRaw
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object")
    )
    .map((item) => ({
      name:
        typeof item.name === "string"
          ? item.name.trim()
          : String(item.name ?? "").trim(),
      estimated_quantity:
        typeof item.estimated_quantity === "string"
          ? item.estimated_quantity.trim()
          : "unknown",
      confidence: normalizeConfidence(item.confidence),
    }))
    .filter((item) => Boolean(item.name));

  return {
    ingredients,
    cooking_method:
      typeof obj.cooking_method === "string" && obj.cooking_method.trim()
        ? obj.cooking_method.trim()
        : "none visible",
    kitchen_tools: asStringArray(obj.kitchen_tools),
  };
}

export function isAllowedVideoMimeType(
  mimeType: string
): mimeType is AllowedVideoMimeType {
  const normalized = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  return (ALLOWED_VIDEO_MIME_TYPES as readonly string[]).includes(normalized);
}

export function resolveVideoMimeType(
  fileName: string,
  mimeType: string
): AllowedVideoMimeType | null {
  const normalized = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (isAllowedVideoMimeType(normalized)) {
    return normalized;
  }

  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".mp4")) return "video/mp4";
  if (lowerName.endsWith(".mov")) return "video/quicktime";
  if (lowerName.endsWith(".webm")) return "video/webm";
  return null;
}

export async function detectIngredientsFromVideo(input: {
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
}): Promise<IngredientDetectionResult> {
  if (!input.buffer.length) {
    throw new GeminiError("Video file is empty.", "validation");
  }

  if (input.buffer.byteLength > MAX_VIDEO_BYTES) {
    throw new GeminiError(
      "Video file is too large. Please upload a video under 20MB.",
      "validation"
    );
  }

  const mimeType = resolveVideoMimeType(
    input.fileName ?? "",
    input.mimeType
  );
  if (!mimeType) {
    throw new GeminiError(
      "Unsupported video type. Please upload mp4, mov, or webm.",
      "validation"
    );
  }

  const text = await generateGeminiText({
    parts: [
      { text: DETECTION_PROMPT },
      {
        inlineData: {
          mimeType,
          data: input.buffer.toString("base64"),
        },
      },
    ],
  });

  const parsed = parseGeminiJson(text);
  return normalizeDetection(parsed);
}
