import { afterEach, describe, expect, it, vi } from "vitest";

describe("POST /api/save-recipe", () => {
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
      new Request("http://localhost/api/save-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          desired_dish: "Soup",
          generated_recipe: { title: "Soup" },
        }),
      })
    );

    expect(response.status).toBe(401);
  });

  it("saves a RecommendedRecipe payload from AI Suggest", async () => {
    const saveRecipe = vi.fn(async () => ({
      data: { id: "r1" },
      error: null,
    }));

    vi.doMock("@/lib/auth", () => ({
      getUser: vi.fn(async () => ({ id: "user-1" })),
    }));
    vi.doMock("@/lib/database", () => ({ saveRecipe }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/save-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          desired_dish: "Lentil Stew",
          available_ingredients: ["lentils"],
          generated_recipe: {
            title: "Lentil Stew",
            description: "Hearty",
            image_prompt: "",
            image_url: "https://example.com/stew.jpg",
            servings: 2,
            prep_time_minutes: 5,
            cook_time_minutes: 30,
            ingredients: ["lentils"],
            instructions: ["Simmer"],
            nutrition_notes: "",
            safety_notes: [],
          },
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(saveRecipe).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        desired_dish: "Lentil Stew",
        generated_recipe: expect.objectContaining({
          title: "Lentil Stew",
          image_url: "https://example.com/stew.jpg",
        }),
      })
    );
  });

  it("accepts a ranked payload and maps it before save", async () => {
    const saveRecipe = vi.fn(async () => ({
      data: { id: "r2" },
      error: null,
    }));

    vi.doMock("@/lib/auth", () => ({
      getUser: vi.fn(async () => ({ id: "user-1" })),
    }));
    vi.doMock("@/lib/database", () => ({ saveRecipe }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/save-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          desired_dish: "Garlic Broccoli Bowl",
          available_ingredients: ["broccoli", "garlic"],
          source: "ranked",
          generated_recipe: {
            title: "Garlic Broccoli Bowl",
            image: "https://img.spoonacular.com/recipes/1.jpg",
            score: 92,
            calories: 430,
            protein: 35,
            fat: 12,
            carbs: 38,
            readyInMinutes: 25,
            matchedIngredients: ["broccoli", "garlic"],
            missingIngredients: ["soy sauce"],
            reason: "Strong match",
          },
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(saveRecipe).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        desired_dish: "Garlic Broccoli Bowl",
        available_ingredients: ["broccoli", "garlic"],
        generated_recipe: expect.objectContaining({
          title: "Garlic Broccoli Bowl",
          image_url: "https://img.spoonacular.com/recipes/1.jpg",
          cook_time_minutes: 25,
          nutrition_notes: expect.stringContaining("Score 92/100"),
        }),
      })
    );
  });

  it("prefers cooking steps when saving a ranked recipe with instructions", async () => {
    const saveRecipe = vi.fn(async () => ({
      data: { id: "r3" },
      error: null,
    }));

    vi.doMock("@/lib/auth", () => ({
      getUser: vi.fn(async () => ({ id: "user-1" })),
    }));
    vi.doMock("@/lib/database", () => ({ saveRecipe }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/save-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          desired_dish: "Garlic Broccoli Bowl",
          available_ingredients: ["broccoli"],
          source: "ranked",
          generated_recipe: {
            id: 101,
            title: "Garlic Broccoli Bowl",
            image: "https://img.spoonacular.com/recipes/1.jpg",
            score: 92,
            calories: 430,
            protein: 35,
            fat: 12,
            carbs: 38,
            readyInMinutes: 25,
            matchedIngredients: ["broccoli"],
            missingIngredients: [],
            reason: "Strong match",
            instructions: ["Steam broccoli", "Toss with garlic"],
          },
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(saveRecipe).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        generated_recipe: expect.objectContaining({
          instructions: ["Steam broccoli", "Toss with garlic"],
        }),
      })
    );
  });

  it("returns 400 for invalid generated_recipe", async () => {
    vi.doMock("@/lib/auth", () => ({
      getUser: vi.fn(async () => ({ id: "user-1" })),
    }));
    vi.doMock("@/lib/database", () => ({
      saveRecipe: vi.fn(),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/save-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          desired_dish: "Mystery",
          generated_recipe: { score: 10 },
        }),
      })
    );

    expect(response.status).toBe(400);
  });
});
