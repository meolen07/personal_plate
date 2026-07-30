import { describe, expect, it } from "vitest";
import {
  clampSpoonacularSearchNumber,
  isNutritionIncomplete,
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
  it("defaults to 20 and clamps to 12–30", () => {
    expect(clampSpoonacularSearchNumber()).toBe(20);
    expect(clampSpoonacularSearchNumber(5)).toBe(12);
    expect(clampSpoonacularSearchNumber(40)).toBe(30);
    expect(clampSpoonacularSearchNumber(24)).toBe(24);
  });
});
