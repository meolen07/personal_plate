"use client";

export async function uploadRecipeImageFromBrowser(
  _userId: string,
  prompt: string,
  title: string
): Promise<string> {
  const response = await fetch("/api/generate-recipe-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, title }),
  });

  const data = (await response.json()) as {
    imageUrl?: string;
    error?: string;
  };

  if (!response.ok || !data.imageUrl) {
    throw new Error(
      data.error ||
        "Unable to generate and store AI recipe images right now. Please try again."
    );
  }

  return data.imageUrl;
}
