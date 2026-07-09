import { GoogleGenAI, Modality } from "@google/genai";
import { createClient } from "@/lib/supabase/server";

const RECIPE_IMAGES_BUCKET = "recipe-images";

function getGeminiApiKeys(): string[] {
  return [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_FALLBACK,
    process.env.NEXT_PUBLIC_GEMINI_API_KEY,
  ].filter((value, index, arr): value is string => Boolean(value) && arr.indexOf(value) === index);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function getExtension(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}

function buildCandidateImageUrls(prompt: string, title: string): string[] {
  const seeds = [11, 23, 37, 53, 71, 97];
  const prompts = [
    prompt,
    `${prompt}, realistic plated meal photography`,
    `A realistic plated photo of ${title}, soft natural light, appetizing food photography`,
  ];

  return prompts.flatMap((candidatePrompt) =>
    seeds.map(
      (seed) =>
        `https://image.pollinations.ai/prompt/${encodeURIComponent(candidatePrompt)}?width=1024&height=768&model=flux&nologo=true&seed=${seed}`
    )
  );
}

function buildCandidatePrompts(prompt: string, title: string): string[] {
  return [
    prompt,
    `${prompt}, realistic plated meal photography`,
    `A realistic plated photo of ${title}, soft natural light, appetizing food photography`,
  ];
}

async function uploadImageBytes(
  userId: string,
  title: string,
  contentType: string,
  imageBytes: ArrayBuffer
): Promise<string | null> {
  const supabase = await createClient();
  const fileExt = getExtension(contentType);
  const filePath = `${userId}/${Date.now()}-${slugify(title)}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from(RECIPE_IMAGES_BUCKET)
    .upload(filePath, imageBytes, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    const message = uploadError.message.toLowerCase();
    if (
      message.includes("bucket") ||
      message.includes("not found") ||
      message.includes("row-level security") ||
      message.includes("policy")
    ) {
      throw new Error(
        "Recipe image storage is not configured. Please create the recipe-images bucket and apply its storage policies."
      );
    }

    return null;
  }

  const { data } = supabase.storage
    .from(RECIPE_IMAGES_BUCKET)
    .getPublicUrl(filePath);

  return data.publicUrl || null;
}

async function tryStoreGeminiImage(
  userId: string,
  prompt: string,
  title: string
): Promise<string | null> {
  const apiKeys = getGeminiApiKeys();
  if (apiKeys.length === 0) {
    return null;
  }
  const modelNames = [
    "gemini-2.5-flash-image",
    "gemini-3.1-flash-image-preview",
    "gemini-3-pro-image-preview",
  ];

  for (const apiKey of apiKeys) {
    const ai = new GoogleGenAI({ apiKey });

    for (const model of modelNames) {
      for (const candidatePrompt of buildCandidatePrompts(prompt, title)) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: candidatePrompt,
            config: {
              responseModalities: [Modality.TEXT, Modality.IMAGE],
            },
          });

          const parts = response.candidates?.[0]?.content?.parts ?? [];
          const imagePart = parts.find(
            (part) => "inlineData" in part && part.inlineData?.data
          );

          if (!imagePart || !("inlineData" in imagePart) || !imagePart.inlineData?.data) {
            continue;
          }

          const contentType = imagePart.inlineData.mimeType || "image/png";
          const imageBytes = Uint8Array.from(
            atob(imagePart.inlineData.data),
            (char) => char.charCodeAt(0)
          );
          const publicUrl = await uploadImageBytes(
            userId,
            title,
            contentType,
            imageBytes.buffer
          );

          if (publicUrl) {
            return publicUrl;
          }
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.includes("Recipe image storage is not configured")
          ) {
            throw error;
          }
        }
      }
    }
  }

  return null;
}

export async function storeRecipeImage(
  userId: string,
  prompt: string,
  title: string
): Promise<string> {
  const geminiImageUrl = await tryStoreGeminiImage(userId, prompt, title);
  if (geminiImageUrl) {
    return geminiImageUrl;
  }

  for (const url of buildCandidateImageUrls(prompt, title)) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "image/*" },
        cache: "no-store",
      });

      if (!response.ok) {
        continue;
      }

      const contentType = response.headers.get("content-type") || "image/jpeg";
      const arrayBuffer = await response.arrayBuffer();

      if (arrayBuffer.byteLength === 0) {
        continue;
      }

      const publicUrl = await uploadImageBytes(
        userId,
        title,
        contentType,
        arrayBuffer
      );

      if (publicUrl) {
        return publicUrl;
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Recipe image storage is not configured")
      ) {
        throw error;
      }
    }
  }

  throw new Error(
    "Unable to generate and store AI recipe images right now. Please try again."
  );
}
