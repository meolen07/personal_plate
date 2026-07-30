import { describe, expect, it } from "vitest";
import {
  MAX_VIDEO_BYTES,
  VERCEL_SAFE_VIDEO_BYTES,
  formatMegabytes,
  videoTooLargeMessage,
} from "@/lib/video-upload";

describe("video-upload helpers", () => {
  it("formats megabytes to one decimal place", () => {
    expect(formatMegabytes(39.7 * 1024 * 1024)).toBe("39.7 MB");
  });

  it("builds a clear oversized message with the configured max", () => {
    const message = videoTooLargeMessage(39.7 * 1024 * 1024);
    expect(message).toContain("39.7 MB");
    expect(message).toContain("20 MB");
    expect(MAX_VIDEO_BYTES).toBe(20 * 1024 * 1024);
    expect(VERCEL_SAFE_VIDEO_BYTES).toBe(4 * 1024 * 1024);
  });
});
