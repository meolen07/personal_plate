import { afterEach, describe, expect, it, vi } from "vitest";

describe("GET /api/recipes/[id]", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.doMock("@/lib/auth", () => ({
      getUser: vi.fn(async () => null),
    }));

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/recipes/123"), {
      params: Promise.resolve({ id: "123" }),
    });

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid ids", async () => {
    vi.doMock("@/lib/auth", () => ({
      getUser: vi.fn(async () => ({ id: "user-1" })),
    }));

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/recipes/abc"), {
      params: Promise.resolve({ id: "abc" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid recipe id.",
    });
  });

  it("returns recipe detail from Spoonacular helper", async () => {
    const getSpoonacularRecipeById = vi.fn(async () => ({
      id: 42,
      title: "Lemon Salmon",
      image: "https://example.com/salmon.jpg",
      readyInMinutes: 25,
      servings: 2,
      sourceUrl: "https://example.com/source",
      cuisines: [],
      diets: [],
      dishTypes: [],
      ingredients: ["salmon", "lemon"],
      instructions: ["Season salmon", "Bake 20 minutes"],
      nutrition: { calories: 430, protein: 35, fat: 12, carbs: 20 },
    }));

    vi.doMock("@/lib/auth", () => ({
      getUser: vi.fn(async () => ({ id: "user-1" })),
    }));
    vi.doMock("@/lib/spoonacular", () => ({
      getSpoonacularRecipeById,
      SpoonacularError: class SpoonacularError extends Error {
        code: string;
        constructor(message: string, code: string) {
          super(message);
          this.code = code;
        }
      },
    }));

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/recipes/42"), {
      params: Promise.resolve({ id: "42" }),
    });

    expect(response.status).toBe(200);
    expect(getSpoonacularRecipeById).toHaveBeenCalledWith(42);
    await expect(response.json()).resolves.toEqual({
      id: 42,
      title: "Lemon Salmon",
      instructions: ["Season salmon", "Bake 20 minutes"],
      ingredients: ["salmon", "lemon"],
      readyInMinutes: 25,
      servings: 2,
      sourceUrl: "https://example.com/source",
    });
  });

  it("returns 404 when the recipe is missing", async () => {
    vi.doMock("@/lib/auth", () => ({
      getUser: vi.fn(async () => ({ id: "user-1" })),
    }));
    vi.doMock("@/lib/spoonacular", () => ({
      getSpoonacularRecipeById: vi.fn(async () => null),
      SpoonacularError: class SpoonacularError extends Error {
        code: string;
        constructor(message: string, code: string) {
          super(message);
          this.code = code;
        }
      },
    }));

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/recipes/99"), {
      params: Promise.resolve({ id: "99" }),
    });

    expect(response.status).toBe(404);
  });

  it("maps Spoonacular missing_key to 503", async () => {
    class SpoonacularError extends Error {
      code: string;
      constructor(message: string, code: string) {
        super(message);
        this.code = code;
      }
    }

    vi.doMock("@/lib/auth", () => ({
      getUser: vi.fn(async () => ({ id: "user-1" })),
    }));
    vi.doMock("@/lib/spoonacular", () => ({
      getSpoonacularRecipeById: vi.fn(async () => {
        throw new SpoonacularError("Spoonacular API key is not configured.", "missing_key");
      }),
      SpoonacularError,
    }));

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/recipes/42"), {
      params: Promise.resolve({ id: "42" }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Spoonacular API key is not configured.",
    });
  });
});
