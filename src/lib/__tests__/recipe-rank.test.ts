import { describe, expect, it } from "vitest";
import {
  buildMatchReason,
  heuristicMatch,
  ingredientsOverlap,
  preferIngredientMatches,
  rankRecipesHeuristically,
  reconcileReason,
  singularizeToken,
} from "@/lib/recipe-rank";
import type { Profile, RankedRecipeRecommendation, SpoonacularRecipeCandidate } from "@/lib/types";

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

function rankedStub(
  overrides: Partial<RankedRecipeRecommendation> & { id: number; title: string }
): RankedRecipeRecommendation {
  return {
    image: "",
    score: 50,
    calories: 400,
    protein: 20,
    fat: 10,
    carbs: 30,
    readyInMinutes: 20,
    matchedIngredients: [],
    missingIngredients: ["salt"],
    reason: "placeholder",
    instructions: [],
    ingredients: [],
    ...overrides,
  };
}

describe("singularizeToken", () => {
  it("handles common culinary plurals", () => {
    expect(singularizeToken("zucchinis")).toBe("zucchini");
    expect(singularizeToken("tomatoes")).toBe("tomato");
    expect(singularizeToken("berries")).toBe("berry");
    expect(singularizeToken("dishes")).toBe("dish");
    expect(singularizeToken("asparagus")).toBe("asparagus");
  });
});

describe("ingredientsOverlap", () => {
  it("matches zucchini to quantity + plural + comma descriptor", () => {
    expect(ingredientsOverlap("zucchini", "3 Zucchinis, rinsed")).toBe(true);
    expect(ingredientsOverlap("Zucchini", "2 cups zucchinis")).toBe(true);
  });

  it("matches through units and multi-word pantry items", () => {
    expect(ingredientsOverlap("chicken", "2 cups chicken breast")).toBe(true);
    expect(ingredientsOverlap("garlic", "1 tsp garlic")).toBe(true);
    expect(ingredientsOverlap("chicken breast", "chicken")).toBe(true);
  });

  it("does not false-positive on substring token traps", () => {
    expect(ingredientsOverlap("egg", "eggplant")).toBe(false);
    expect(ingredientsOverlap("oil", "boiling water")).toBe(false);
    expect(ingredientsOverlap("salt", "saltine crackers")).toBe(false);
  });
});

describe("heuristicMatch", () => {
  it("matches pantry items through quantity/unit prefixes", () => {
    const { matched, missing } = heuristicMatch(
      ["chicken", "garlic"],
      ["2 cups chicken breast", "1 tsp garlic", "soy sauce"]
    );
    expect(matched).toEqual(["2 cups chicken breast", "1 tsp garlic"]);
    expect(missing).toEqual(["soy sauce"]);
  });

  it("matches zucchini against 3 Zucchinis, rinsed", () => {
    const { matched, missing } = heuristicMatch(
      ["zucchini"],
      ["3 Zucchinis, rinsed", "olive oil", "salt"]
    );
    expect(matched).toEqual(["3 Zucchinis, rinsed"]);
    expect(missing).toEqual(["olive oil", "salt"]);
  });
});

describe("reconcileReason", () => {
  it("replaces Gemini claims when local match is empty", () => {
    const reason = reconcileReason(
      "Leverages the available zucchini",
      [],
      1
    );
    expect(reason).toBe(buildMatchReason([], 1));
    expect(reason.toLowerCase()).not.toContain("zucchini");
  });

  it("keeps Gemini reason when matches exist", () => {
    expect(
      reconcileReason("Great high-protein fit using salmon.", ["salmon"], 2)
    ).toBe("Great high-protein fit using salmon.");
  });
});

describe("preferIngredientMatches", () => {
  it("filters out zero-match recipes when pantry items exist", () => {
    const filtered = preferIngredientMatches(
      [
        rankedStub({
          id: 1,
          title: "No Match Soup",
          matchedIngredients: [],
          score: 90,
        }),
        rankedStub({
          id: 2,
          title: "Zucchini Chips",
          matchedIngredients: ["3 Zucchinis, rinsed"],
          score: 70,
        }),
      ],
      1
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(2);
  });

  it("keeps a few low-scored recipes when everything is zero-match", () => {
    const filtered = preferIngredientMatches(
      [
        rankedStub({ id: 1, title: "A", matchedIngredients: [], score: 80 }),
        rankedStub({ id: 2, title: "B", matchedIngredients: [], score: 70 }),
      ],
      2
    );
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((r) => r.score <= 12)).toBe(true);
    expect(filtered.every((r) => r.reason.includes("Limited pantry"))).toBe(
      true
    );
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
    expect(ranked[0].score).toBeGreaterThan(ranked[1]?.score ?? -1);
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

  it("filters zero-match recipes when the user has pantry ingredients", () => {
    const withZucchini = candidate({
      id: 1,
      title: "Baked Zucchini Chips",
      ingredients: ["3 Zucchinis, rinsed", "olive oil", "salt"],
    });
    const noOverlap = candidate({
      id: 2,
      title: "Peanut Noodles",
      ingredients: ["rice noodles", "peanut sauce", "lime"],
      nutrition: { calories: 500, protein: 15, fat: 20, carbs: 60 },
    });

    const ranked = rankRecipesHeuristically(profile, ["zucchini"], [
      noOverlap,
      withZucchini,
    ]);

    expect(ranked.every((r) => r.matchedIngredients.length > 0)).toBe(true);
    expect(ranked[0].id).toBe(1);
    expect(ranked.some((r) => r.id === 2)).toBe(false);
  });

  it("ranks a zero-match recipe below a matching one before filter", () => {
    const withMatch = candidate({
      id: 1,
      title: "Garlic Chicken",
      ingredients: ["chicken", "garlic", "rice"],
    });
    const zeroMatch = candidate({
      id: 2,
      title: "Tofu Bowl",
      ingredients: ["tofu", "soy sauce", "sesame"],
    });

    const ranked = rankRecipesHeuristically(
      profile,
      ["chicken", "garlic"],
      [zeroMatch, withMatch]
    );

    expect(ranked[0].id).toBe(1);
    expect(ranked[0].matchedIngredients.length).toBeGreaterThan(0);
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
    expect(ranked.length).toBeLessThanOrEqual(10);
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
  });
});
