import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { storeRecipeImage } from "@/lib/recipe-images";

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    prompt?: string;
    title?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { prompt, title } = body;

  if (!prompt || !title) {
    return NextResponse.json(
      { error: "Recipe prompt and title are required." },
      { status: 400 }
    );
  }

  try {
    const imageUrl = await storeRecipeImage(user.id, prompt, title);
    return NextResponse.json({ imageUrl });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to generate and store AI recipe images right now. Please try again.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
