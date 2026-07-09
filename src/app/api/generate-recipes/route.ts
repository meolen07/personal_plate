import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getProfile } from "@/lib/database";
import { generateRecipeWithGemini, GeminiError } from "@/lib/gemini";

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    availableIngredients?: string[];
    optionalNotes?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { availableIngredients, optionalNotes } = body;

  if (!availableIngredients?.length) {
    return NextResponse.json(
      { error: "Available ingredients are required." },
      { status: 400 }
    );
  }

  const profile = await getProfile(user.id);

  try {
    const result = await generateRecipeWithGemini(
      profile,
      availableIngredients,
      optionalNotes
    );

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GeminiError) {
      const status =
        err.code === "missing_key"
          ? 503
          : err.code === "quota"
            ? 429
            : err.code === "invalid_json"
              ? 502
              : 500;

      return NextResponse.json({ error: err.message }, { status });
    }
    return NextResponse.json(
      {
        error:
          "Unable to generate recommendations right now. Please check your Gemini API key, quota, or network connection.",
      },
      { status: 500 }
    );
  }
}
