import { afterEach, describe, expect, it, vi } from "vitest";

describe("estimateRecipeNutritionFromUsda", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("averages USDA lookups into per-serving nutrition", async () => {
    vi.stubEnv("USDA_API_KEY", "test-usda-key");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        foods: [
          {
            fdcId: 1,
            description: "Chicken breast",
            foodNutrients: [
              { nutrientName: "Energy", nutrientNumber: "208", value: 165 },
              { nutrientName: "Protein", nutrientNumber: "203", value: 31 },
              { nutrientName: "Total lipid (fat)", nutrientNumber: "204", value: 3.6 },
              { nutrientName: "Carbohydrate", nutrientNumber: "205", value: 0 },
              { nutrientName: "Fiber", nutrientNumber: "291", value: 0 },
              { nutrientName: "Sodium", nutrientNumber: "307", value: 74 },
            ],
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { estimateRecipeNutritionFromUsda } = await import("@/lib/usda");
    const nutrition = await estimateRecipeNutritionFromUsda(
      ["1 cup chicken breast", "broccoli"],
      2
    );

    expect(nutrition).not.toBeNull();
    expect(nutrition?.calories).toBeGreaterThan(0);
    expect(nutrition?.protein).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("throws missing_key when USDA_API_KEY is absent", async () => {
    delete process.env.USDA_API_KEY;
    const { lookupUsdaNutrition, UsdaError } = await import("@/lib/usda");

    await expect(lookupUsdaNutrition("salmon")).rejects.toBeInstanceOf(UsdaError);
  });
});
