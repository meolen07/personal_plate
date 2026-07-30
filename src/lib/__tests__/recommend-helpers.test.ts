import { describe, expect, it } from "vitest";
import {
  buildRecommendResponseCacheKey,
  normalizeIngredientList,
  parseOptionalStringArray,
} from "@/lib/recommend";
import {
  isAllowedVideoMimeType,
  resolveVideoMimeType,
} from "@/lib/ingredient-detect";
import type { Profile } from "@/lib/types";

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

describe("buildRecommendResponseCacheKey", () => {
  const profile: Profile = {
    full_name: "Test",
    age: 30,
    gender: "female",
    height_cm: 165,
    weight_kg: 60,
    medical_conditions: [],
    medications: [],
    allergies: ["peanut"],
    dietary_restrictions: [],
    nutrition_goals: "high protein",
    preferred_cuisine: "Mediterranean",
    activity_level: "moderately_active",
    target_calories: 450,
    budget_usd: 10,
    preferred_foods: ["salmon"],
    disliked_foods: [],
  };

  it("is stable for same user, ingredients (order-insensitive), and profile", () => {
    const a = buildRecommendResponseCacheKey({
      userId: "u1",
      ingredientsUsed: ["salmon", "lemon"],
      profile,
      maxReadyTime: 30,
    });
    const b = buildRecommendResponseCacheKey({
      userId: "u1",
      ingredientsUsed: ["Lemon", "Salmon"],
      profile,
      maxReadyTime: 30,
    });
    expect(a).toBe(b);
    expect(a.startsWith("pp:recommend:response:")).toBe(true);
  });

  it("changes when user, ingredients, or maxReadyTime differ", () => {
    const base = buildRecommendResponseCacheKey({
      userId: "u1",
      ingredientsUsed: ["salmon"],
      profile,
      maxReadyTime: 30,
    });
    expect(
      buildRecommendResponseCacheKey({
        userId: "u2",
        ingredientsUsed: ["salmon"],
        profile,
        maxReadyTime: 30,
      })
    ).not.toBe(base);
    expect(
      buildRecommendResponseCacheKey({
        userId: "u1",
        ingredientsUsed: ["chicken"],
        profile,
        maxReadyTime: 30,
      })
    ).not.toBe(base);
    expect(
      buildRecommendResponseCacheKey({
        userId: "u1",
        ingredientsUsed: ["salmon"],
        profile,
        maxReadyTime: 45,
      })
    ).not.toBe(base);
  });
});

describe("recommend latency knobs", () => {
  it("exposes lean candidate count and longer e2e cache TTL", async () => {
    const {
      RECOMMEND_CANDIDATE_COUNT,
      RECOMMEND_RESPONSE_CACHE_TTL,
      isRecommendUsdaEnabled,
    } = await import("@/lib/recommend");
    expect(RECOMMEND_CANDIDATE_COUNT).toBe(12);
    expect(RECOMMEND_RESPONSE_CACHE_TTL).toBe(60 * 12);
    expect(isRecommendUsdaEnabled()).toBe(false);
  });

  it("defaults RECOMMEND_RANK_MODE to heuristic (Gemini off)", async () => {
    const { isHeuristicRankOnly } = await import("@/lib/recipe-rank");
    expect(isHeuristicRankOnly()).toBe(true);
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
