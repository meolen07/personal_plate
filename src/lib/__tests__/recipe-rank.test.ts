import { describe, expect, it, vi } from "vitest";
import {
  blendGeminiWithIngredientFit,
  buildMatchReason,
  buildPantryReason,
  buildProfileReasonParts,
  compareByIngredientFit,
  heuristicMatch,
  ingredientFitScore,
  ingredientsOverlap,
  matchCoverageRatio,
  MAX_SOFT_MISSING,
  MIN_SOFT_MATCH_RATIO,
  preferIngredientMatches,
  rankRecipesHeuristically,
  reconcileReason,
  rehydrateRankedFromCandidates,
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

describe("buildMatchReason", () => {
  const recipe = {
    title: "Lemon Salmon",
    calories: 430,
    protein: 35,
    carbs: 20,
    ingredients: ["salmon", "lemon", "olive oil"],
    cuisines: ["Mediterranean"],
    diets: [],
    pricePerServing: 8,
  };

  it("combines pantry matches with calorie and allergy profile signals", () => {
    const reason = buildMatchReason(
      recipe,
      profile,
      ["salmon", "lemon", "olive oil"],
      [],
      3
    );
    expect(reason).toContain("Uses 3 ingredients from your list");
    expect(reason.toLowerCase()).toMatch(/kcal|calorie|target/);
    expect(reason.toLowerCase()).toMatch(/peanut|allergen/);
  });

  it("returns pantry-only when profile has no usable signals", () => {
    const bare: Profile = {
      ...profile,
      allergies: [],
      target_calories: null,
      preferred_cuisine: "",
      nutrition_goals: "",
      medical_conditions: [],
      budget_usd: null,
      preferred_foods: [],
      dietary_restrictions: [],
    };
    expect(
      buildMatchReason(recipe, bare, ["salmon"], ["lemon"], 2)
    ).toBe(buildPantryReason(["salmon"], 2));
  });
});

describe("buildProfileReasonParts", () => {
  it("mentions near-target calories and avoided allergies", () => {
    const parts = buildProfileReasonParts(
      {
        title: "Lemon Salmon",
        calories: 430,
        protein: 35,
        ingredients: ["salmon", "lemon"],
        cuisines: ["Mediterranean"],
      },
      profile
    );
    expect(parts.some((p) => /kcal|target/i.test(p))).toBe(true);
    expect(parts.some((p) => /peanut|allergen/i.test(p))).toBe(true);
  });
});

describe("reconcileReason", () => {
  it("replaces Gemini claims when local match is empty", () => {
    const reason = reconcileReason(
      "Leverages the available zucchini",
      [],
      1,
      { title: "Soup", calories: 400, ingredients: ["broth"] },
      profile
    );
    expect(reason).toBe(
      buildMatchReason(
        { title: "Soup", calories: 400, ingredients: ["broth"] },
        profile,
        [],
        [],
        1
      )
    );
    expect(reason.toLowerCase()).not.toContain("zucchini");
  });

  it("keeps Gemini reason when matches exist and profile is mentioned", () => {
    expect(
      reconcileReason(
        "Great high-protein fit using salmon.",
        ["salmon"],
        2,
        {
          title: "Salmon Bowl",
          calories: 430,
          protein: 35,
          ingredients: ["salmon"],
        },
        profile
      )
    ).toBe("Great high-protein fit using salmon.");
  });

  it("appends profile signals when Gemini omits them", () => {
    const reason = reconcileReason(
      "Uses salmon from your list.",
      ["salmon"],
      2,
      {
        title: "Lemon Salmon",
        calories: 430,
        protein: 35,
        ingredients: ["salmon", "lemon"],
        cuisines: ["Mediterranean"],
      },
      profile
    );
    expect(reason.startsWith("Uses salmon from your list.")).toBe(true);
    expect(reason.toLowerCase()).toMatch(/kcal|target|peanut|allergen|cuisine/);
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
          missingIngredients: ["olive oil", "salt"],
          score: 70,
        }),
      ],
      1
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(2);
  });

  it("soft-drops recipes with missing > 3 when ≤3-missing alternatives exist", () => {
    const fewMissing = Array.from({ length: 6 }, (_, i) =>
      rankedStub({
        id: i + 1,
        title: `Few ${i + 1}`,
        matchedIngredients: ["chicken", "garlic", "rice"],
        missingIngredients: ["soy sauce", "oil"],
        score: 70 - i,
      })
    );
    const fourMissing = rankedStub({
      id: 50,
      title: "Four extras",
      matchedIngredients: ["chicken", "garlic", "rice"],
      missingIngredients: ["a", "b", "c", "d"],
      score: 99,
    });
    const fiveMissing = rankedStub({
      id: 51,
      title: "Five extras",
      matchedIngredients: ["chicken", "garlic"],
      missingIngredients: ["a", "b", "c", "d", "e"],
      score: 98,
    });

    const filtered = preferIngredientMatches(
      [...fewMissing, fourMissing, fiveMissing],
      4
    );
    expect(filtered.every((r) => r.missingIngredients.length <= 3)).toBe(true);
    expect(filtered.every((r) => r.id !== 50 && r.id !== 51)).toBe(true);
    expect(MAX_SOFT_MISSING).toBe(3);
    expect(MIN_SOFT_MATCH_RATIO).toBe(0.4);
  });

  it("soft-drops high-missing recipes when stronger pantry fits exist", () => {
    const strongFits = Array.from({ length: 6 }, (_, i) =>
      rankedStub({
        id: i + 1,
        title: `Strong ${i + 1}`,
        matchedIngredients: ["chicken", "garlic", "rice"],
        missingIngredients: ["soy sauce", "sesame oil"],
        score: 80 - i,
      })
    );
    const weak = rankedStub({
      id: 99,
      title: "Zucchini-only feast",
      matchedIngredients: ["zucchini"],
      missingIngredients: Array.from({ length: 10 }, (_, i) => `extra-${i}`),
      score: 95,
    });

    const filtered = preferIngredientMatches([...strongFits, weak], 3);
    expect(filtered.every((r) => r.id !== 99)).toBe(true);
    expect(filtered.length).toBeGreaterThanOrEqual(6);
    expect(
      filtered.every(
        (r) =>
          matchCoverageRatio(
            r.matchedIngredients.length,
            r.missingIngredients.length
          ) >= MIN_SOFT_MATCH_RATIO &&
          r.missingIngredients.length <= MAX_SOFT_MISSING
      )
    ).toBe(true);
  });

  it("keeps weak matches when almost no strong fits remain", () => {
    const weakOnly = [
      rankedStub({
        id: 1,
        title: "Sparse A",
        matchedIngredients: ["zucchini"],
        missingIngredients: Array.from({ length: 10 }, (_, i) => `a-${i}`),
        score: 40,
      }),
      rankedStub({
        id: 2,
        title: "Sparse B",
        matchedIngredients: ["zucchini", "onion"],
        missingIngredients: Array.from({ length: 8 }, (_, i) => `b-${i}`),
        score: 35,
      }),
    ];
    const filtered = preferIngredientMatches(weakOnly, 2);
    expect(filtered.length).toBe(2);
    expect(filtered[0].matchedIngredients.length).toBeGreaterThan(0);
    // Fewer missing wins even when score is lower.
    expect(filtered[0].id).toBe(2);
    expect(filtered[0].missingIngredients.length).toBeLessThan(
      filtered[1].missingIngredients.length
    );
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

describe("compareByIngredientFit", () => {
  it("ranks fewer-missing above more-missing when matched counts are similar", () => {
    const few = rankedStub({
      id: 1,
      matchedIngredients: ["chicken", "garlic", "rice"],
      missingIngredients: ["soy"],
      score: 40,
    });
    const many = rankedStub({
      id: 2,
      matchedIngredients: ["chicken", "garlic", "rice"],
      missingIngredients: ["a", "b", "c", "d", "e"],
      score: 95,
    });
    expect(compareByIngredientFit(few, many)).toBeLessThan(0);
    expect(compareByIngredientFit(many, few)).toBeGreaterThan(0);
  });
});

describe("ingredientFitScore", () => {
  it("ranks 1 match + 10 missing below 3 match + 2 missing", () => {
    const weak = ingredientFitScore(
      ["zucchini"],
      Array.from({ length: 10 }, (_, i) => `miss-${i}`)
    );
    const strong = ingredientFitScore(
      ["chicken", "garlic", "rice"],
      ["soy sauce", "sesame oil"]
    );
    expect(strong).toBeGreaterThan(weak);
    expect(weak).toBeLessThan(20);
  });

  it("ranks fewer-missing higher when matched counts are similar", () => {
    const few = ingredientFitScore(
      ["chicken", "garlic", "rice"],
      ["soy sauce"]
    );
    const many = ingredientFitScore(
      ["chicken", "garlic", "rice"],
      ["a", "b", "c", "d", "e"]
    );
    expect(few).toBeGreaterThan(many);
  });
});

describe("blendGeminiWithIngredientFit", () => {
  it("pulls down a high Gemini score for many-missing recipes", () => {
    const blended = blendGeminiWithIngredientFit(
      95,
      ["zucchini"],
      Array.from({ length: 10 }, (_, i) => `miss-${i}`),
      2
    );
    expect(blended).toBeLessThan(40);
  });

  it("keeps ingredient fit dominant over a high Gemini score", () => {
    const fewMissing = blendGeminiWithIngredientFit(
      50,
      ["chicken", "garlic", "rice"],
      ["soy"],
      4
    );
    const manyMissing = blendGeminiWithIngredientFit(
      95,
      ["chicken", "garlic", "rice"],
      ["a", "b", "c", "d", "e"],
      4
    );
    expect(fewMissing).toBeGreaterThan(manyMissing);
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
    expect(ranked[0].reason).toContain("from your list");
    expect(ranked[0].reason.toLowerCase()).toMatch(/kcal|calorie|target/);
    expect(ranked[0].reason.toLowerCase()).toMatch(/peanut|allergen/);
  });

  it("ranks 1 match + 10 missing below 3 match + 2 missing", () => {
    const available = ["chicken", "broccoli", "garlic", "rice", "zucchini"];
    const manyMissing = candidate({
      id: 1,
      title: "Zucchini Complex Stew",
      ingredients: [
        "zucchini",
        "cream",
        "bacon",
        "cheese",
        "wine",
        "stock",
        "thyme",
        "shallot",
        "butter",
        "flour",
        "mushroom",
      ],
      nutrition: { calories: 450, protein: 20, fat: 20, carbs: 30 },
      pricePerServing: 8,
      readyInMinutes: 25,
      cuisines: ["Mediterranean"],
    });
    const fewMissing = candidate({
      id: 2,
      title: "Chicken Broccoli Rice",
      ingredients: ["chicken", "broccoli", "garlic", "rice", "soy sauce", "oil"],
      nutrition: { calories: 450, protein: 30, fat: 10, carbs: 40 },
      pricePerServing: 8,
      readyInMinutes: 25,
      cuisines: ["Mediterranean"],
    });

    const ranked = rankRecipesHeuristically(profile, available, [
      manyMissing,
      fewMissing,
    ]);

    expect(ranked[0].id).toBe(2);
    expect(ranked[0].score).toBeGreaterThan(ranked[1]?.score ?? -1);
    expect(ranked[0].matchedIngredients.length).toBe(4);
    expect(ranked[0].missingIngredients.length).toBe(2);
    expect(ranked[1]?.matchedIngredients.length).toBe(1);
    expect(ranked[1]?.missingIngredients.length).toBe(10);
  });

  it("ranks fewer-missing above more-missing when matched counts are similar", () => {
    const available = ["chicken", "broccoli", "garlic", "rice", "onion"];
    const fewMissing = candidate({
      id: 1,
      title: "Nearly Pantry Bowl",
      ingredients: ["chicken", "broccoli", "garlic", "soy sauce"],
      nutrition: { calories: 450, protein: 30, fat: 10, carbs: 40 },
      pricePerServing: 8,
      readyInMinutes: 25,
      cuisines: ["Mediterranean"],
    });
    const manyMissing = candidate({
      id: 2,
      title: "Almost Same Matches Feast",
      ingredients: [
        "chicken",
        "broccoli",
        "garlic",
        "cream",
        "bacon",
        "cheese",
        "wine",
        "pastry",
      ],
      nutrition: { calories: 450, protein: 30, fat: 10, carbs: 40 },
      pricePerServing: 8,
      readyInMinutes: 25,
      cuisines: ["Mediterranean"],
    });

    const ranked = rankRecipesHeuristically(profile, available, [
      manyMissing,
      fewMissing,
    ]);

    expect(ranked[0].id).toBe(1);
    expect(ranked[0].matchedIngredients.length).toBe(
      ranked[1].matchedIngredients.length
    );
    expect(ranked[0].missingIngredients.length).toBeLessThan(
      ranked[1].missingIngredients.length
    );
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("soft-filters high-missing recipes when better alternatives exist", () => {
    const available = ["chicken", "garlic", "rice", "broccoli", "onion", "tomato"];
    const strong = Array.from({ length: 6 }, (_, i) =>
      candidate({
        id: i + 1,
        title: `Pantry Bowl ${i + 1}`,
        ingredients: [
          "chicken",
          "garlic",
          "rice",
          "broccoli",
          "soy sauce",
          "oil",
        ],
        nutrition: { calories: 450, protein: 30, fat: 10, carbs: 40 },
        pricePerServing: 8,
        readyInMinutes: 20,
        cuisines: ["Mediterranean"],
      })
    );
    const weak = candidate({
      id: 99,
      title: "Onion-only Banquet",
      ingredients: [
        "onion",
        "cream",
        "bacon",
        "cheese",
        "wine",
        "stock",
        "pastry",
        "egg",
        "butter",
        "flour",
        "mushroom",
      ],
      nutrition: { calories: 600, protein: 15, fat: 30, carbs: 40 },
      pricePerServing: 12,
      readyInMinutes: 45,
      cuisines: ["Mediterranean"],
    });

    const ranked = rankRecipesHeuristically(profile, available, [
      weak,
      ...strong,
    ]);

    expect(ranked.every((r) => r.id !== 99)).toBe(true);
    expect(ranked.length).toBeGreaterThanOrEqual(6);
    expect(
      ranked.every(
        (r) =>
          r.matchedIngredients.length > 0 &&
          r.missingIngredients.length <= MAX_SOFT_MISSING
      )
    ).toBe(true);
  });

  it("soft-filters recipes with missing > 3 when ≤3-missing alternatives exist", () => {
    const available = ["chicken", "garlic", "rice", "broccoli", "onion"];
    const tight = Array.from({ length: 6 }, (_, i) =>
      candidate({
        id: i + 1,
        title: `Tight Pantry ${i + 1}`,
        ingredients: ["chicken", "garlic", "rice", "soy sauce", "oil"],
        nutrition: { calories: 450, protein: 30, fat: 10, carbs: 40 },
        pricePerServing: 8,
        readyInMinutes: 20,
        cuisines: ["Mediterranean"],
      })
    );
    const loose = candidate({
      id: 88,
      title: "Loose Shopping List",
      ingredients: [
        "chicken",
        "garlic",
        "rice",
        "cream",
        "bacon",
        "cheese",
        "wine",
      ],
      nutrition: { calories: 500, protein: 25, fat: 20, carbs: 30 },
      pricePerServing: 10,
      readyInMinutes: 30,
      cuisines: ["Mediterranean"],
    });

    const ranked = rankRecipesHeuristically(profile, available, [
      loose,
      ...tight,
    ]);

    expect(ranked.every((r) => r.id !== 88)).toBe(true);
    expect(
      ranked.every((r) => r.missingIngredients.length <= MAX_SOFT_MISSING)
    ).toBe(true);
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

  it("returns at most 10 recipes sorted by ingredient fit", () => {
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
      expect(
        compareByIngredientFit(ranked[i - 1], ranked[i])
      ).toBeLessThanOrEqual(0);
    }
  });
});

describe("rank latency knobs", () => {
  it("limits Gemini input and defaults to heuristic-only mode", async () => {
    const { RANK_INPUT_LIMIT, isHeuristicRankOnly } = await import(
      "@/lib/recipe-rank"
    );
    expect(RANK_INPUT_LIMIT).toBe(10);
    // Default (unset): skip Gemini on hot path
    expect(isHeuristicRankOnly()).toBe(true);
  });

  it("opts into Gemini only when RECOMMEND_RANK_MODE is gemini|ai|full", async () => {
    const { isHeuristicRankOnly } = await import("@/lib/recipe-rank");
    vi.stubEnv("RECOMMEND_RANK_MODE", "gemini");
    expect(isHeuristicRankOnly()).toBe(false);
    vi.stubEnv("RECOMMEND_RANK_MODE", "ai");
    expect(isHeuristicRankOnly()).toBe(false);
    vi.stubEnv("RECOMMEND_RANK_MODE", "full");
    expect(isHeuristicRankOnly()).toBe(false);
    vi.stubEnv("RECOMMEND_RANK_MODE", "heuristic");
    expect(isHeuristicRankOnly()).toBe(true);
    vi.stubEnv("RECOMMEND_RANK_MODE", "fast");
    expect(isHeuristicRankOnly()).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("rehydrateRankedFromCandidates", () => {
  it("overlays fresh candidate macros onto cached zero-nutrition ranks", () => {
    const ranked: RankedRecipeRecommendation[] = [
      {
        id: 1,
        title: "Miso Soup",
        image: "",
        score: 80,
        calories: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
        readyInMinutes: 15,
        matchedIngredients: ["tofu"],
        missingIngredients: [],
        reason: "Uses tofu",
        instructions: [],
        ingredients: [],
      },
    ];

    const hydrated = rehydrateRankedFromCandidates(ranked, [
      candidate({
        id: 1,
        title: "Miso Soup",
        nutrition: { calories: 180, protein: 12, fat: 6, carbs: 14 },
        instructions: ["Add miso and simmer.", "Serve hot."],
        ingredients: ["tofu", "miso"],
      }),
    ]);

    expect(hydrated[0]).toMatchObject({
      calories: 180,
      protein: 12,
      fat: 6,
      carbs: 14,
      instructions: ["Add miso and simmer.", "Serve hot."],
      ingredients: ["tofu", "miso"],
      score: 80,
    });
  });
});
