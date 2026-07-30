import { afterEach, describe, expect, it, vi } from "vitest";

describe("POST /api/recipes/recommend", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.doMock("@/lib/auth", () => ({
      getUser: vi.fn(async () => null),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/recipes/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients: ["egg"] }),
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid JSON body", async () => {
    vi.doMock("@/lib/auth", () => ({
      getUser: vi.fn(async () => ({ id: "user-1" })),
    }));
    vi.doMock("@/lib/database", () => ({
      getProfile: vi.fn(),
      getFridgeItems: vi.fn(),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/recipes/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not-json",
      })
    );

    expect(response.status).toBe(400);
  });

  it("returns ranked recipes and merges fridge items when requested", async () => {
    vi.doMock("@/lib/auth", () => ({
      getUser: vi.fn(async () => ({ id: "user-1" })),
    }));

    const getFridgeItems = vi.fn(async () => [
      { id: "1", user_id: "user-1", name: "garlic", created_at: "" },
    ]);
    const getProfile = vi.fn(async () => null);

    vi.doMock("@/lib/database", () => ({
      getFridgeItems,
      getProfile,
    }));

    const recommendRecipes = vi.fn(async () => ({
      recipes: [
        {
          id: 101,
          title: "Garlic Broccoli Bowl",
          image: "https://example.com/r.jpg",
          score: 96,
          calories: 430,
          protein: 35,
          fat: 12,
          carbs: 38,
          readyInMinutes: 25,
          matchedIngredients: ["broccoli", "garlic"],
          missingIngredients: [],
          reason: "Strong ingredient match",
          instructions: ["Steam broccoli", "Toss with garlic"],
        },
      ],
      ingredientsUsed: ["broccoli", "garlic"],
    }));

    vi.doMock("@/lib/recommend", () => ({
      parseOptionalStringArray: (value: unknown) =>
        Array.isArray(value)
          ? value.filter((item): item is string => typeof item === "string")
          : [],
      RecommendValidationError: class RecommendValidationError extends Error {},
      recommendRecipes,
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/recipes/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredients: ["broccoli"],
          includeFridge: true,
          maxReadyTime: 35,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.recipes).toHaveLength(1);
    expect(body.recipes[0].score).toBe(96);
    expect(body.recipes[0].id).toBe(101);
    expect(body.recipes[0].instructions).toEqual([
      "Steam broccoli",
      "Toss with garlic",
    ]);
    expect(getFridgeItems).toHaveBeenCalledWith("user-1");
    expect(recommendRecipes).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredients: ["broccoli"],
        fridgeItems: ["garlic"],
        maxReadyTime: 35,
        userId: "user-1",
      })
    );
  });
});
