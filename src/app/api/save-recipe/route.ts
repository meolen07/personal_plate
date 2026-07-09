import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { saveRecipe } from "@/lib/database";
import type { RecommendedRecipe, Substitution } from "@/lib/types";

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    desired_dish?: string;
    available_ingredients?: string[];
    generated_recipe?: RecommendedRecipe;
    warnings?: string[];
    substitutions?: Substitution[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const {
    desired_dish,
    available_ingredients,
    generated_recipe,
    warnings,
    substitutions,
  } = body;

  if (!desired_dish || !generated_recipe) {
    return NextResponse.json(
      { error: "Suggested dish name and generated recipe are required." },
      { status: 400 }
    );
  }

  const { data, error } = await saveRecipe(user.id, {
    desired_dish,
    available_ingredients: available_ingredients ?? [],
    generated_recipe,
    warnings: warnings ?? [],
    substitutions: substitutions ?? [],
  });

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json(data);
}
