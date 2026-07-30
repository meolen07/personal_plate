import { describe, expect, it } from "vitest";
import {
  clampSpoonacularSearchNumber,
  extractSpoonacularNutrition,
  isNutritionIncomplete,
  mergeSpoonacularCandidates,
  normalizeRecipeTitleForDedupe,
  pickAlternateIngredientSubset,
  SPOONACULAR_FANOUT_MERGE_CAP,
  SPOONACULAR_INGREDIENT_LIMIT,
  trimIngredientsForSpoonacularSearch,
} from "@/lib/spoonacular";
import type { SpoonacularRecipeCandidate } from "@/lib/types";

function candidate(
  overrides: Partial<SpoonacularRecipeCandidate> & { id: number; title: string }
): SpoonacularRecipeCandidate {
  return {
    image: "",
    readyInMinutes: 20,
    servings: 2,
    cuisines: [],
    diets: [],
    dishTypes: [],
    ingredients: ["chicken"],
    instructions: ["Cook"],
    nutrition: { calories: 400, protein: 30, fat: 10, carbs: 20 },
    ...overrides,
  };
}

describe("isNutritionIncomplete", () => {
  it("detects zeroed nutrition as incomplete", () => {
    expect(
      isNutritionIncomplete({
        calories: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
      })
    ).toBe(true);
  });

  it("treats partial nutrition as complete enough", () => {
    expect(
      isNutritionIncomplete({
        calories: 430,
        protein: 0,
        fat: 0,
        carbs: 0,
      })
    ).toBe(false);
  });
});

describe("extractSpoonacularNutrition", () => {
  it("reads nested nutrition.nutrients amounts", () => {
    expect(
      extractSpoonacularNutrition({
        nutrition: {
          nutrients: [
            { name: "Calories", amount: 430.4 },
            { name: "Protein", amount: 35.2 },
            { name: "Fat", amount: 12.1 },
            { name: "Carbohydrates", amount: 38.6 },
          ],
        },
      })
    ).toEqual({
      calories: 430,
      protein: 35,
      fat: 12,
      carbs: 39,
      fiber: 0,
      sodium: 0,
    });
  });

  it("parses string nutrient amounts and alternate fat/carb names", () => {
    expect(
      extractSpoonacularNutrition({
        nutrition: {
          nutrients: [
            { name: "Calories", amount: "584 kcal" },
            { name: "Protein", amount: "19g" },
            { name: "Total Fat", amount: "20g" },
            { name: "Carbohydrate", amount: "84g" },
          ],
        },
      })
    ).toMatchObject({
      calories: 584,
      protein: 19,
      fat: 20,
      carbs: 84,
    });
  });

  it("falls back to flat top-level calorie/macro fields", () => {
    expect(
      extractSpoonacularNutrition({
        calories: 521,
        protein: "35g",
        fat: "10g",
        carbs: "69g",
      })
    ).toMatchObject({
      calories: 521,
      protein: 35,
      fat: 10,
      carbs: 69,
    });
  });
});

describe("clampSpoonacularSearchNumber", () => {
  it("defaults to 30 and clamps to 10–30", () => {
    expect(clampSpoonacularSearchNumber()).toBe(30);
    expect(clampSpoonacularSearchNumber(5)).toBe(10);
    expect(clampSpoonacularSearchNumber(40)).toBe(30);
    expect(clampSpoonacularSearchNumber(24)).toBe(24);
  });
});

describe("normalizeRecipeTitleForDedupe", () => {
  it("normalizes punctuation and casing", () => {
    expect(normalizeRecipeTitleForDedupe("Lemon-Garlic Salmon!")).toBe(
      "lemon garlic salmon"
    );
    expect(normalizeRecipeTitleForDedupe("Chicken & Rice")).toBe(
      "chicken and rice"
    );
  });
});

describe("pickAlternateIngredientSubset", () => {
  it("rotates past the first ingredient when the list is long enough", () => {
    expect(
      pickAlternateIngredientSubset(["chicken", "rice", "broccoli", "garlic"])
    ).toEqual(["rice", "broccoli", "garlic", "chicken"]);
  });

  it("keeps short lists unchanged", () => {
    expect(pickAlternateIngredientSubset(["salmon", "lemon", "oil"])).toEqual([
      "salmon",
      "lemon",
      "oil",
    ]);
  });
});

describe("mergeSpoonacularCandidates", () => {
  it("dedupes by id across batches and keeps first occurrence", () => {
    const a = candidate({
      id: 1,
      title: "Lemon Salmon",
      missedIngredientCount: 2,
      usedIngredientCount: 3,
    });
    const aDup = candidate({
      id: 1,
      title: "Lemon Salmon (copy)",
      missedIngredientCount: 0,
      usedIngredientCount: 5,
    });
    const b = candidate({
      id: 2,
      title: "Herb Chicken",
      missedIngredientCount: 0,
      usedIngredientCount: 4,
    });

    const merged = mergeSpoonacularCandidates([[a], [aDup, b]]);
    expect(merged.map((c) => c.id)).toEqual([2, 1]);
    expect(merged.find((c) => c.id === 1)?.title).toBe("Lemon Salmon");
  });

  it("dedupes by normalized title when ids differ", () => {
    const a = candidate({
      id: 10,
      title: "Garlic Chicken!",
      missedIngredientCount: 1,
      usedIngredientCount: 2,
    });
    const b = candidate({
      id: 11,
      title: "garlic chicken",
      missedIngredientCount: 0,
      usedIngredientCount: 4,
    });
    const c = candidate({
      id: 12,
      title: "Tomato Pasta",
      missedIngredientCount: 0,
      usedIngredientCount: 3,
    });

    const merged = mergeSpoonacularCandidates([[a, c], [b]]);
    expect(merged.map((item) => item.id)).toEqual([12, 10]);
  });

  it("sorts by fewest missed then most used after merge", () => {
    const highMiss = candidate({
      id: 1,
      title: "A",
      missedIngredientCount: 3,
      usedIngredientCount: 5,
    });
    const lowMissLowUsed = candidate({
      id: 2,
      title: "B",
      missedIngredientCount: 1,
      usedIngredientCount: 2,
    });
    const lowMissHighUsed = candidate({
      id: 3,
      title: "C",
      missedIngredientCount: 1,
      usedIngredientCount: 4,
    });

    const merged = mergeSpoonacularCandidates([
      [highMiss],
      [lowMissLowUsed, lowMissHighUsed],
    ]);
    expect(merged.map((c) => c.id)).toEqual([3, 2, 1]);
  });

  it("caps unique candidates at the merge limit", () => {
    const batch = Array.from({ length: 30 }, (_, i) =>
      candidate({
        id: i + 1,
        title: `Recipe ${i + 1}`,
        missedIngredientCount: i,
        usedIngredientCount: 1,
      })
    );
    const merged = mergeSpoonacularCandidates(
      [batch],
      SPOONACULAR_FANOUT_MERGE_CAP
    );
    expect(merged).toHaveLength(SPOONACULAR_FANOUT_MERGE_CAP);
    expect(merged[0]?.id).toBe(1);
  });
});

describe("trimIngredientsForSpoonacularSearch", () => {
  it("caps at 8 and drops pantry noise when the list is long", () => {
    expect(SPOONACULAR_INGREDIENT_LIMIT).toBe(8);
    const trimmed = trimIngredientsForSpoonacularSearch([
      "chicken breast",
      "broccoli",
      "salt",
      "olive oil",
      "garlic powder",
      "pepper",
      "water",
      "sugar",
      "rice",
      "onion",
      "carrot",
      "soy sauce",
      "zucchini",
    ]);
    expect(trimmed.length).toBeLessThanOrEqual(8);
    expect(trimmed).toContain("chicken breast");
    expect(trimmed).toContain("broccoli");
    expect(trimmed).toContain("rice");
    expect(trimmed).not.toContain("salt");
    expect(trimmed).not.toContain("olive oil");
    expect(trimmed).not.toContain("garlic powder");
    expect(trimmed).not.toContain("water");
  });

  it("keeps short lists intact (still prefers mains first)", () => {
    expect(
      trimIngredientsForSpoonacularSearch(["salmon", "lemon", "salt"])
    ).toEqual(["salmon", "lemon", "salt"]);
  });

  it("falls back to noise staples when only pantry items are provided", () => {
    const trimmed = trimIngredientsForSpoonacularSearch([
      "salt",
      "pepper",
      "oil",
      "water",
    ]);
    expect(trimmed.length).toBeGreaterThan(0);
    expect(trimmed.length).toBeLessThanOrEqual(8);
  });
});
