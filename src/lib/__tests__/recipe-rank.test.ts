import { describe, expect, it } from "vitest";
import {
  heuristicMatch,
  rankRecipesHeuristically,
} from "@/lib/recipe-rank";
import type { Profile, SpoonacularRecipeCandidate } from "@/lib/types";

const profile: Profile = {
  full_name: "Test",
  age: 28,
  gender: "female",
  height_cm: 165,
  weight_kg: 60,
  medical_conditions: [],
  medications: [],
  allergies: ["peanut"],
  dietary_restrictions: [],
  nutrition_goals: "high protein",
  preferred_cuisine: "Mediterranean",
  activity_level: "moderately_active",
  target_calories: 450,
  budget_usd: 10,
  preferred_foods: ["salmon"],
  disliked_foods: ["cilantro"],
};

function candidate(
  overrides: Partial<SpoonacularRecipeCandidate> & { id: number; title: string }
): SpoonacularRecipeCandidate {
  return {
    image: "",
    readyInMinutes: 25,
    servings: 2,
    cuisines: ["Mediterranean"],
    diets: [],
    dishTypes: [],
    ingredients: ["salmon", "lemon", "olive oil"],
    instructions: ["Cook"],
    nutrition: { calories: 430, protein: 35, fat: 12, carbs: 20 },
    pricePerServing: 8,
    ...overrides,
  };
}

describe("heuristicMatch", () => {
  it("matches pantry items through quantity/unit prefixes", () => {
    const { matched, missing } = heuristicMatch(
      ["chicken", "garlic"],
      ["2 cups chicken breast", "1 tsp garlic", "soy sauce"]
    );
    expect(matched).toEqual(["2 cups chicken breast", "1 tsp garlic"]);
    expect(missing).toEqual(["soy sauce"]);
  });
});

describe("rankRecipesHeuristically", () => {
  it("ranks allergen-heavy recipes lower and preferred foods higher", () => {
    const safe = candidate({ id: 1, title: "Lemon Salmon" });
    const allergic = candidate({
      id: 2,
      title: "Peanut Stir Fry",
      ingredients: ["chicken", "peanut sauce", "cilantro"],
      nutrition: { calories: 600, protein: 20, fat: 25, carbs: 40 },
      pricePerServing: 15,
      cuisines: ["Asian"],
    });

    const ranked = rankRecipesHeuristically(
      profile,
      ["salmon", "lemon", "olive oil"],
      [allergic, safe]
    );

    expect(ranked[0].title).toBe("Lemon Salmon");
    expect(ranked[0].id).toBe(1);
    expect(ranked[0].instructions).toEqual(["Cook"]);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked[0].matchedIngredients.length).toBeGreaterThan(0);
  });

  it("ranks recipes with more matched ingredients above those with fewer", () => {
    const available = ["chicken", "broccoli", "garlic", "rice"];
    const highMatch = candidate({
      id: 10,
      title: "Chicken Broccoli Bowl",
      ingredients: ["chicken", "broccoli", "garlic", "rice"],
      nutrition: { calories: 450, protein: 30, fat: 10, carbs: 40 },
      pricePerServing: 8,
      readyInMinutes: 25,
      cuisines: ["Mediterranean"],
    });
    const lowMatch = candidate({
      id: 11,
      title: "Chicken Only Stir Fry",
      ingredients: ["chicken", "soy sauce", "sesame oil", "ginger"],
      nutrition: { calories: 450, protein: 30, fat: 10, carbs: 40 },
      pricePerServing: 8,
      readyInMinutes: 25,
      cuisines: ["Mediterranean"],
    });

    const ranked = rankRecipesHeuristically(profile, available, [
      lowMatch,
      highMatch,
    ]);

    expect(ranked[0].id).toBe(10);
    expect(ranked[0].matchedIngredients.length).toBeGreaterThan(
      ranked[1].matchedIngredients.length
    );
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked[0].missingIngredients.length).toBeLessThan(
      ranked[1].missingIngredients.length
    );
  });

  it("returns at most 10 recipes sorted by score", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      candidate({
        id: i + 1,
        title: `Recipe ${i + 1}`,
        nutrition: {
          calories: 450 - i,
          protein: 30,
          fat: 10,
          carbs: 20,
        },
      })
    );

    const ranked = rankRecipesHeuristically(profile, ["salmon"], many);
    expect(ranked).toHaveLength(10);
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
  });
});
