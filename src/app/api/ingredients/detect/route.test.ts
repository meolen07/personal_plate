import { afterEach, describe, expect, it, vi } from "vitest";

describe("POST /api/ingredients/detect", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.doMock("@/lib/auth", () => ({
      getUser: vi.fn(async () => null),
    }));

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/ingredients/detect", {
      method: "POST",
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when video file is missing", async () => {
    vi.doMock("@/lib/auth", () => ({
      getUser: vi.fn(async () => ({ id: "user-1" })),
    }));

    const { POST } = await import("./route");
    const form = new FormData();
    form.set("notes", "no video");

    const response = await POST(
      new Request("http://localhost/api/ingredients/detect", {
        method: "POST",
        body: form,
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/video/i);
  });

  it("returns detection JSON for a valid video upload", async () => {
    vi.doMock("@/lib/auth", () => ({
      getUser: vi.fn(async () => ({ id: "user-1" })),
    }));

    const detectIngredientsFromVideo = vi.fn(async () => ({
      ingredients: [
        { name: "tomato", estimated_quantity: "2 pieces", confidence: 0.9 },
      ],
      cooking_method: "none visible",
      kitchen_tools: ["knife"],
    }));

    vi.doMock("@/lib/ingredient-detect", () => ({
      detectIngredientsFromVideo,
    }));

    const { POST } = await import("./route");
    const form = new FormData();
    form.set(
      "video",
      new File([new Uint8Array([1, 2, 3])], "fridge.mp4", { type: "video/mp4" })
    );

    const response = await POST(
      new Request("http://localhost/api/ingredients/detect", {
        method: "POST",
        body: form,
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ingredients: [{ name: "tomato" }],
      kitchen_tools: ["knife"],
    });
    expect(detectIngredientsFromVideo).toHaveBeenCalledOnce();
  });
});
