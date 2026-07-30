import { describe, expect, it } from "vitest";
import {
  isRankedRecipeLike,
  normalizeGeneratedRecipeForSave,
  toRecommendedRecipeFromRanked,
} from "@/lib/save-ranked-recipe";
import type { RankedRecipeRecommendation } from "@/lib/types";

const sampleRanked: RankedRecipeRecommendation = {
  id: 101,
  title: "Garlic Broccoli Bowl",
  image: "https://img.spoonacular.com/recipes/1.jpg",
  score: 92,
  calories: 430.4,
  protein: 35.2,
  fat: 12.1,
  carbs: 38.6,
  readyInMinutes: 25,
  matchedIngredients: ["broccoli", "garlic"],
  missingIngredients: ["soy sauce"],
  reason: "High protein match for your goals",
  instructions: [],
};

describe("isRankedRecipeLike", () => {
  it("recognizes ranked payloads", () => {
    expect(isRankedRecipeLike(sampleRanked)).toBe(true);
  });

  it("rejects RecommendedRecipe-shaped payloads", () => {
    expect(
      isRankedRecipeLike({
        title: "Soup",
        description: "Warm",
        image_prompt: "",
        image_url: "https://example.com/a.jpg",
        servings: 2,
        prep_time_minutes: 5,
        cook_time_minutes: 20,
        ingredients: ["onion"],
        instructions: ["Simmer"],
        nutrition_notes: "",
        safety_notes: [],
      })
    ).toBe(false);
  });
});

describe("toRecommendedRecipeFromRanked", () => {
  it("maps ranked fields into RecommendedRecipe storage shape", () => {
    const mapped = toRecommendedRecipeFromRanked(sampleRanked);

    expect(mapped.title).toBe("Garlic Broccoli Bowl");
    expect(mapped.image_url).toBe(sampleRanked.image);
    expect(mapped.description).toBe(sampleRanked.reason);
    expect(mapped.cook_time_minutes).toBe(25);
    expect(mapped.servings).toBe(1);
    expect(mapped.prep_time_minutes).toBe(0);
    expect(mapped.ingredients).toEqual([
      "broccoli",
      "garlic",
      "soy sauce (needed)",
    ]);
    expect(mapped.nutrition_notes).toContain("430 kcal");
    expect(mapped.nutrition_notes).toContain("Score 92/100");
    expect(mapped.instructions[0]).toContain("High protein match");
    expect(mapped.instructions.some((s) => s.includes("soy sauce"))).toBe(
      true
    );
  });

  it("handles empty ingredient lists", () => {
    const mapped = toRecommendedRecipeFromRanked({
      ...sampleRanked,
      matchedIngredients: [],
      missingIngredients: [],
      reason: "",
      readyInMinutes: 0,
    });

    expect(mapped.ingredients).toEqual([]);
    expect(mapped.description).toContain("score 92/100");
    expect(mapped.cook_time_minutes).toBe(0);
    expect(mapped.instructions).toHaveLength(1);
  });

  it("prefers cooking instructions when present", () => {
    const mapped = toRecommendedRecipeFromRanked({
      ...sampleRanked,
      instructions: ["Steam broccoli", "Toss with garlic"],
    });

    expect(mapped.instructions).toEqual([
      "Steam broccoli",
      "Toss with garlic",
    ]);
    expect(mapped.description).toBe(sampleRanked.reason);
  });
  it("prefers full Spoonacular ingredient lines when present", () => {
    const mapped = toRecommendedRecipeFromRanked({
      ...sampleRanked,
      ingredients: ["2 cups broccoli", "3 cloves garlic", "1 tbsp soy sauce"],
    });

    expect(mapped.ingredients).toEqual([
      "2 cups broccoli",
      "3 cloves garlic",
      "1 tbsp soy sauce",
    ]);
  });

  it("cleans Whatch video junk in cooking steps", () => {
    const mapped = toRecommendedRecipeFromRanked({
      ...sampleRanked,
      instructions: ["Whatch video", "Steam broccoli"],
    });

    expect(mapped.instructions).toEqual(["Watch video", "Steam broccoli"]);
  });
});

describe("normalizeGeneratedRecipeForSave", () => {
  it("converts ranked payloads", () => {
    const normalized = normalizeGeneratedRecipeForSave(sampleRanked);
    expect(normalized?.title).toBe("Garlic Broccoli Bowl");
    expect(normalized?.image_url).toBe(sampleRanked.image);
  });

  it("passes through RecommendedRecipe payloads", () => {
    const normalized = normalizeGeneratedRecipeForSave({
      title: "Lentil Stew",
      description: "Hearty",
      image_prompt: "bowl of stew",
      image_url: "https://example.com/stew.jpg",
      servings: 4,
      prep_time_minutes: 10,
      cook_time_minutes: 40,
      ingredients: ["lentils", "carrot"],
      instructions: ["Cook"],
      nutrition_notes: "High fiber",
      safety_notes: ["Watch sodium"],
    });

    expect(normalized).toEqual({
      title: "Lentil Stew",
      description: "Hearty",
      image_prompt: "bowl of stew",
      image_url: "https://example.com/stew.jpg",
      servings: 4,
      prep_time_minutes: 10,
      cook_time_minutes: 40,
      ingredients: ["lentils", "carrot"],
      instructions: ["Cook"],
      nutrition_notes: "High fiber",
      safety_notes: ["Watch sodium"],
    });
  });

  it("returns null for invalid payloads", () => {
    expect(normalizeGeneratedRecipeForSave(null)).toBeNull();
    expect(normalizeGeneratedRecipeForSave({ score: 10 })).toBeNull();
    expect(normalizeGeneratedRecipeForSave({ title: "" })).toBeNull();
  });
});
