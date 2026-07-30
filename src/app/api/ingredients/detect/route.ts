import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { GeminiError, geminiErrorHttpStatus } from "@/lib/gemini-client";
import { detectIngredientsFromVideo } from "@/lib/ingredient-detect";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data with a video file." },
      { status: 400 }
    );
  }

  const file = formData.get("video") ?? formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "A video file field named 'video' (or 'file') is required." },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await detectIngredientsFromVideo({
      buffer,
      mimeType: file.type || "application/octet-stream",
      fileName: file.name,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GeminiError) {
      return NextResponse.json(
        { error: err.message },
        { status: geminiErrorHttpStatus(err.code) }
      );
    }

    return NextResponse.json(
      {
        error:
          "Unable to detect ingredients right now. Please check your Gemini API key, quota, or video file.",
      },
      { status: 500 }
    );
  }
}
