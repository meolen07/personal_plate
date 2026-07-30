import { describe, expect, it } from "vitest";
import { isNutritionIncomplete } from "@/lib/spoonacular";

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
