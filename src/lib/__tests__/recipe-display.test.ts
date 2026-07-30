import { describe, expect, it } from "vitest";
import {
  cleanInstructionStrings,
  hasEnoughCookingSteps,
  isBlogFluffStep,
  normalizeDisplayInstructions,
  shouldShowRecipeIngredients,
} from "@/lib/recipe-display";

describe("normalizeDisplayInstructions", () => {
  it("filters empty and junk steps", () => {
    expect(
      normalizeDisplayInstructions(["", "  ", "undefined", ".", "Season salmon"])
    ).toEqual([{ kind: "step", text: "Season salmon" }]);
  });

  it("normalizes Whatch video junk into a single Watch video item", () => {
    expect(normalizeDisplayInstructions(["Whatch video"])).toEqual([
      { kind: "video", href: null, label: "Watch video" },
    ]);
    expect(
      normalizeDisplayInstructions([
        "Watch the video",
        "Watch video https://youtu.be/abc",
      ])
    ).toEqual([
      {
        kind: "video",
        href: "https://youtu.be/abc",
        label: "Watch video",
      },
    ]);
  });

  it("keeps real steps and soft-fixes Whatch typo mid-sentence", () => {
    expect(
      normalizeDisplayInstructions([
        "Preheat oven to 350F",
        "Whatch carefully so it does not burn",
      ])
    ).toEqual([
      { kind: "step", text: "Preheat oven to 350F" },
      { kind: "step", text: "Watch carefully so it does not burn" },
    ]);
  });

  it("treats URL-only steps as Watch video links", () => {
    expect(
      normalizeDisplayInstructions(["https://www.youtube.com/watch?v=xyz"])
    ).toEqual([
      {
        kind: "video",
        href: "https://www.youtube.com/watch?v=xyz",
        label: "Watch video",
      },
    ]);
  });

  it("drops miso-soup-style blog fluff and keeps cooking verbs", () => {
    const items = normalizeDisplayInstructions([
      "Bring water to a boil and add miso paste.",
      "Simmer for 5 minutes, then add tofu and green onions.",
      "What do you usually add to your Miso Soup?",
      "Seriously Soupy Serena",
      "Leave a comment and follow me for more soup ideas!",
    ]);

    expect(items).toEqual([
      { kind: "step", text: "Bring water to a boil and add miso paste." },
      {
        kind: "step",
        text: "Simmer for 5 minutes, then add tofu and green onions.",
      },
    ]);
    expect(hasEnoughCookingSteps(items)).toBe(true);
  });

  it("marks sparse leftover fluff as not enough cooking steps", () => {
    const items = normalizeDisplayInstructions([
      "What do you usually add to your Miso Soup?",
      "Seriously Soupy Serena",
      "Enjoy!",
    ]);
    expect(items).toEqual([]);
    expect(hasEnoughCookingSteps(items)).toBe(false);
  });
});

describe("isBlogFluffStep", () => {
  it("flags rhetorical questions and author sign-offs", () => {
    expect(
      isBlogFluffStep("What do you usually add to your Miso Soup?")
    ).toBe(true);
    expect(isBlogFluffStep("Seriously Soupy Serena")).toBe(true);
    expect(isBlogFluffStep("Follow me for more recipes")).toBe(true);
    expect(
      isBlogFluffStep("Add the miso paste and simmer for 5 minutes.")
    ).toBe(false);
  });
});

describe("cleanInstructionStrings", () => {
  it("returns plain strings suitable for storage", () => {
    expect(
      cleanInstructionStrings(["Whatch video", "Bake 20 minutes"])
    ).toEqual(["Watch video", "Bake 20 minutes"]);
  });

  it("strips miso-soup blog fluff from stored steps", () => {
    expect(
      cleanInstructionStrings([
        "Chop the tofu into cubes.",
        "What do you usually add to your Miso Soup?",
        "Seriously Soupy Serena",
        "Add miso and simmer gently.",
      ])
    ).toEqual([
      "Chop the tofu into cubes.",
      "Add miso and simmer gently.",
    ]);
  });
});

describe("shouldShowRecipeIngredients", () => {
  it("hides full list when it only duplicates matched/missing names", () => {
    expect(
      shouldShowRecipeIngredients(
        ["broccoli", "garlic", "soy sauce"],
        ["broccoli", "garlic"],
        ["soy sauce"]
      )
    ).toEqual([]);
  });

  it("shows full list when lines include quantities or extra detail", () => {
    expect(
      shouldShowRecipeIngredients(
        ["2 cups broccoli florets", "3 cloves garlic", "1 tbsp soy sauce"],
        ["broccoli", "garlic"],
        ["soy sauce"]
      )
    ).toEqual([
      "2 cups broccoli florets",
      "3 cloves garlic",
      "1 tbsp soy sauce",
    ]);
  });

  it("shows full list when it includes ingredients beyond matched/missing", () => {
    expect(
      shouldShowRecipeIngredients(
        ["salmon", "lemon", "olive oil"],
        ["salmon"],
        []
      )
    ).toEqual(["salmon", "lemon", "olive oil"]);
  });
});
