import { describe, expect, it } from "vitest";
import { GeminiError } from "@/lib/gemini-client";
import { normalizeDetection } from "@/lib/ingredient-detect";

describe("normalizeDetection", () => {
  it("maps ingredients with quantity and confidence", () => {
    expect(
      normalizeDetection({
        ingredients: [
          {
            name: " tomato ",
            estimated_quantity: "2 pieces",
            confidence: 0.91,
          },
          { name: "onion", estimated_quantity: "1", confidence: 85 },
        ],
        cooking_method: "stir-fry",
        kitchen_tools: ["wok", "spatula"],
      })
    ).toEqual({
      ingredients: [
        {
          name: "tomato",
          estimated_quantity: "2 pieces",
          confidence: 0.91,
        },
        {
          name: "onion",
          estimated_quantity: "1",
          confidence: 0.85,
        },
      ],
      cooking_method: "stir-fry",
      kitchen_tools: ["wok", "spatula"],
    });
  });

  it("defaults missing quantity/method and drops blank names", () => {
    expect(
      normalizeDetection({
        ingredients: [
          { name: "garlic", confidence: 0.5 },
          { name: "  ", confidence: 1 },
          { name: "eggs", estimated_quantity: 3, confidence: "0.7" },
        ],
        kitchen_tools: "knife, board",
      })
    ).toEqual({
      ingredients: [
        {
          name: "garlic",
          estimated_quantity: "unknown",
          confidence: 0.5,
        },
        {
          name: "eggs",
          estimated_quantity: "unknown",
          confidence: 0.7,
        },
      ],
      cooking_method: "none visible",
      kitchen_tools: ["knife", "board"],
    });
  });

  it("throws GeminiError for non-object payloads", () => {
    expect(() => normalizeDetection(null)).toThrow(GeminiError);
    expect(() => normalizeDetection("bad")).toThrow(GeminiError);
  });
});
