import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import {
  getSpoonacularRecipeById,
  SpoonacularError,
} from "@/lib/spoonacular";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0 || !Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid recipe id." }, { status: 400 });
  }

  try {
    const recipe = await getSpoonacularRecipeById(id);
    if (!recipe) {
      return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
    }

    return NextResponse.json({
      id: recipe.id,
      title: recipe.title,
      instructions: recipe.instructions,
      ingredients: recipe.ingredients,
      readyInMinutes: recipe.readyInMinutes,
      servings: recipe.servings,
      sourceUrl: recipe.sourceUrl ?? null,
    });
  } catch (err) {
    if (err instanceof SpoonacularError) {
      const status =
        err.code === "missing_key" ? 503 : err.code === "quota" ? 429 : 500;
      return NextResponse.json({ error: err.message }, { status });
    }

    return NextResponse.json(
      { error: "Failed to load recipe details. Please try again." },
      { status: 500 }
    );
  }
}
