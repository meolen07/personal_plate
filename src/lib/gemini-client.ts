/**
 * Shared Gemini helpers used by recipe generation, video detection, and ranking.
 */

export type GeminiErrorCode =
  | "missing_key"
  | "api_error"
  | "quota"
  | "invalid_json"
  | "validation";

export class GeminiError extends Error {
  constructor(
    message: string,
    public code: GeminiErrorCode
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
] as const;

export function getGeminiApiKeys(): string[] {
  return [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_FALLBACK,
    process.env.NEXT_PUBLIC_GEMINI_API_KEY,
  ].filter(
    (value, index, arr): value is string =>
      Boolean(value) && arr.indexOf(value) === index
  );
}

export function extractJsonPayload(text: string): string {
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

export function isRetryableModelError(message: string): boolean {
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

export function shouldTryNextGeminiKeyOrModel(message: string): boolean {
  const lower = message.toLowerCase();

  return (
    lower.includes("not found") ||
    lower.includes("404") ||
    lower.includes("is not supported") ||
    isRetryableModelError(message) ||
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("resource exhausted") ||
    lower.includes("429") ||
    lower.includes("api key not valid") ||
    lower.includes("permission denied") ||
    lower.includes("authentication")
  );
}

export function mapFinalGeminiFailure(lastError: unknown): never {
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

export type GeminiContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

interface GeminiGenerateOptions {
  parts: GeminiContentPart[];
  models?: readonly string[];
}

/**
 * Calls Gemini generateContent across keys/models and returns raw response text.
 */
export async function generateGeminiText(
  options: GeminiGenerateOptions
): Promise<string> {
  const apiKeys = getGeminiApiKeys();
  if (apiKeys.length === 0) {
    throw new GeminiError(
      "Gemini API key is missing. Please add GEMINI_API_KEY to your environment variables.",
      "missing_key"
    );
  }

  const modelsToTry = options.models ?? GEMINI_MODELS;
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
                  parts: options.parts.map((part) => {
                    if ("text" in part) {
                      return { text: part.text };
                    }
                    return {
                      inline_data: {
                        mime_type: part.inlineData.mimeType,
                        data: part.inlineData.data,
                      },
                    };
                  }),
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
            payload.error?.message ||
            `Gemini request failed with ${response.status}`;
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

        if (shouldTryNextGeminiKeyOrModel(message)) {
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
    mapFinalGeminiFailure(lastError);
  }

  return text;
}

export function parseGeminiJson<T = unknown>(text: string): T {
  try {
    return JSON.parse(extractJsonPayload(text)) as T;
  } catch {
    throw new GeminiError(
      "The AI response could not be processed. Please try again.",
      "invalid_json"
    );
  }
}

export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === "string" ? item.trim() : String(item ?? "").trim()
      )
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

export function asNumber(value: unknown): number {
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

export function geminiErrorHttpStatus(code: GeminiErrorCode): number {
  if (code === "missing_key") return 503;
  if (code === "quota") return 429;
  if (code === "invalid_json") return 502;
  if (code === "validation") return 400;
  return 500;
}
