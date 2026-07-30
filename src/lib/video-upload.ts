/**
 * Shared video upload limits for client + server.
 *
 * App/Gemini validation allows up to MAX_VIDEO_BYTES.
 * Vercel Functions hard-cap request bodies at ~4.5 MB (all plans) — uploads
 * routed through `/api/*` above that return 413 before our handlers run.
 * Prefer clips under VERCEL_SAFE_VIDEO_BYTES in production.
 */
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

/** Practical ceiling when the API runs on Vercel Functions (~4.5 MB body limit). */
export const VERCEL_SAFE_VIDEO_BYTES = 4 * 1024 * 1024;

export function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function maxVideoMegabytesLabel(): string {
  return `${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))} MB`;
}

export function videoTooLargeMessage(bytes: number): string {
  return `Video is too large (${formatMegabytes(bytes)}). Please use a file under ${maxVideoMegabytesLabel()}.`;
}

export function vercelPayloadTooLargeMessage(): string {
  return `Upload was rejected because the video is too large for the server (Vercel limit ~4.5 MB). Please use a shorter, lower-resolution clip under about ${formatMegabytes(VERCEL_SAFE_VIDEO_BYTES)}.`;
}

export function videoUploadHint(): string {
  return `Short cooking or countertop clip — mp4, mov, or webm, max ${maxVideoMegabytesLabel()}. On Vercel, prefer under ~${formatMegabytes(VERCEL_SAFE_VIDEO_BYTES)} (shorter / lower resolution) or the request may fail before detection. Detect ingredients first to preview name, quantity, and confidence, or let Discover Recipes detect from the clip.`;
}
