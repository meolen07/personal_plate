import { describe, expect, it } from "vitest";
import {
  clampSpoonacularSearchNumber,
  extractSpoonacularNutrition,
  isNutritionIncomplete,
  SPOONACULAR_INGREDIENT_LIMIT,
  trimIngredientsForSpoonacularSearch,
} from "@/lib/spoonacular";

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
  it("defaults to 12 and clamps to 10–30", () => {
    expect(clampSpoonacularSearchNumber()).toBe(12);
    expect(clampSpoonacularSearchNumber(5)).toBe(10);
    expect(clampSpoonacularSearchNumber(40)).toBe(30);
    expect(clampSpoonacularSearchNumber(24)).toBe(24);
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
