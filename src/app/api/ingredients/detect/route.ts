import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { GeminiError, geminiErrorHttpStatus } from "@/lib/gemini-client";
import { detectIngredientsFromVideo } from "@/lib/ingredient-detect";
import {
  MAX_VIDEO_BYTES,
  VERCEL_SAFE_VIDEO_BYTES,
  vercelPayloadTooLargeMessage,
  videoTooLargeMessage,
} from "@/lib/video-upload";

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
    const contentLength = Number(request.headers.get("content-length") ?? NaN);
    if (Number.isFinite(contentLength) && contentLength > MAX_VIDEO_BYTES) {
      return NextResponse.json(
        { error: videoTooLargeMessage(contentLength) },
        { status: 400 }
      );
    }
    if (
      Number.isFinite(contentLength) &&
      contentLength > VERCEL_SAFE_VIDEO_BYTES
    ) {
      return NextResponse.json(
        { error: vercelPayloadTooLargeMessage() },
        { status: 400 }
      );
    }
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

  if (file.size > MAX_VIDEO_BYTES) {
    return NextResponse.json(
      { error: videoTooLargeMessage(file.size) },
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
