import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getFridgeItems, getProfile } from "@/lib/database";
import { GeminiError, geminiErrorHttpStatus } from "@/lib/gemini-client";
import {
  parseOptionalStringArray,
  RecommendValidationError,
  recommendRecipes,
} from "@/lib/recommend";
import { SpoonacularError } from "@/lib/spoonacular";
import { UsdaError } from "@/lib/usda";

export const runtime = "nodejs";

function errorStatusFromExternal(err: unknown): { message: string; status: number } | null {
  if (err instanceof GeminiError) {
    return { message: err.message, status: geminiErrorHttpStatus(err.code) };
  }
  if (err instanceof SpoonacularError) {
    const status =
      err.code === "missing_key" ? 503 : err.code === "quota" ? 429 : 500;
    return { message: err.message, status };
  }
  if (err instanceof UsdaError) {
    const status =
      err.code === "missing_key" ? 503 : err.code === "quota" ? 429 : 500;
    return { message: err.message, status };
  }
  if (err instanceof RecommendValidationError) {
    return { message: err.message, status: 400 };
  }
  return null;
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") || "";

  let ingredients: string[] = [];
  let fridgeItems: string[] = [];
  let includeFridge = false;
  let maxReadyTime: number | undefined;
  let video:
    | {
        buffer: Buffer;
        mimeType: string;
        fileName?: string;
      }
    | undefined;

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();

      const ingredientsRaw = formData.get("ingredients");
      if (typeof ingredientsRaw === "string" && ingredientsRaw.trim()) {
        try {
          const parsed = JSON.parse(ingredientsRaw) as unknown;
          ingredients = parseOptionalStringArray(parsed);
        } catch {
          ingredients = ingredientsRaw
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
        }
      }

      const fridgeRaw = formData.get("fridgeItems");
      if (typeof fridgeRaw === "string" && fridgeRaw.trim()) {
        try {
          fridgeItems = parseOptionalStringArray(JSON.parse(fridgeRaw));
        } catch {
          fridgeItems = fridgeRaw
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
        }
      }

      includeFridge =
        formData.get("includeFridge") === "true" ||
        formData.get("includeFridge") === "1";

      const maxReadyRaw = formData.get("maxReadyTime");
      if (typeof maxReadyRaw === "string" && maxReadyRaw.trim()) {
        const parsed = Number(maxReadyRaw);
        if (Number.isFinite(parsed) && parsed > 0) {
          maxReadyTime = parsed;
        }
      }

      const file = formData.get("video") ?? formData.get("file");
      if (file instanceof File) {
        video = {
          buffer: Buffer.from(await file.arrayBuffer()),
          mimeType: file.type || "application/octet-stream",
          fileName: file.name,
        };
      }
    } else {
      let body: {
        ingredients?: unknown;
        fridgeItems?: unknown;
        includeFridge?: unknown;
        maxReadyTime?: unknown;
      };

      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: "Invalid request body" },
          { status: 400 }
        );
      }

      ingredients = parseOptionalStringArray(body.ingredients);
      fridgeItems = parseOptionalStringArray(body.fridgeItems);
      includeFridge = Boolean(body.includeFridge);

      if (
        typeof body.maxReadyTime === "number" &&
        Number.isFinite(body.maxReadyTime) &&
        body.maxReadyTime > 0
      ) {
        maxReadyTime = body.maxReadyTime;
      }
    }
  } catch {
    return NextResponse.json(
      { error: "Unable to parse recommendation request." },
      { status: 400 }
    );
  }

  const [profile, fridgeFromStore] = await Promise.all([
    getProfile(user.id),
    includeFridge
      ? getFridgeItems(user.id)
      : Promise.resolve([] as Awaited<ReturnType<typeof getFridgeItems>>),
  ]);

  if (includeFridge) {
    fridgeItems = [
      ...fridgeItems,
      ...fridgeFromStore.map((item) => item.name),
    ];
  }

  try {
    const result = await recommendRecipes({
      profile,
      ingredients,
      fridgeItems,
      video,
      maxReadyTime,
      userId: user.id,
    });

    return NextResponse.json({
      recipes: result.recipes,
      detection: result.detection,
      ingredientsUsed: result.ingredientsUsed,
    });
  } catch (err) {
    const mapped = errorStatusFromExternal(err);
    if (mapped) {
      return NextResponse.json(
        { error: mapped.message },
        { status: mapped.status }
      );
    }

    return NextResponse.json(
      {
        error:
          "Unable to recommend recipes right now. Please check API keys, quota, or try again.",
      },
      { status: 500 }
    );
  }
}
