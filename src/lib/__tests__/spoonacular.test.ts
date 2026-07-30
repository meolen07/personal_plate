import { describe, expect, it } from "vitest";
import {
  clampSpoonacularSearchNumber,
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
