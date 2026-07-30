import { describe, expect, it } from "vitest";
import {
  normalizeIngredientList,
  parseOptionalStringArray,
} from "@/lib/recommend";
import {
  isAllowedVideoMimeType,
  resolveVideoMimeType,
} from "@/lib/ingredient-detect";

describe("normalizeIngredientList", () => {
  it("trims, dedupes case-insensitively, and preserves first casing", () => {
    expect(
      normalizeIngredientList(["  Egg ", "egg", "Milk", "milk", ""])
    ).toEqual(["Egg", "Milk"]);
  });
});

describe("parseOptionalStringArray", () => {
  it("returns empty array for non-arrays", () => {
    expect(parseOptionalStringArray("chicken")).toEqual([]);
    expect(parseOptionalStringArray(null)).toEqual([]);
  });

  it("normalizes string arrays", () => {
    expect(parseOptionalStringArray(["chicken", " chicken ", "rice"])).toEqual([
      "chicken",
      "rice",
    ]);
  });
});

describe("video mime helpers", () => {
  it("accepts mp4, mov, and webm", () => {
    expect(isAllowedVideoMimeType("video/mp4")).toBe(true);
    expect(isAllowedVideoMimeType("video/quicktime")).toBe(true);
    expect(isAllowedVideoMimeType("video/webm")).toBe(true);
    expect(isAllowedVideoMimeType("image/png")).toBe(false);
  });

  it("resolves mime from filename when type is missing", () => {
    expect(resolveVideoMimeType("fridge.mov", "")).toBe("video/quicktime");
    expect(resolveVideoMimeType("clip.webm", "application/octet-stream")).toBe(
      "video/webm"
    );
    expect(resolveVideoMimeType("notes.txt", "text/plain")).toBeNull();
  });
});
