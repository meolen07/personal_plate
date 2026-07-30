import { describe, expect, it } from "vitest";
import { computeBmi } from "@/lib/bmi";

describe("computeBmi", () => {
  it("returns unknown when height or weight is missing", () => {
    expect(computeBmi(null, 70).category).toBe("unknown");
    expect(computeBmi(170, null).bmi).toBeNull();
  });

  it("classifies normal BMI correctly", () => {
    const result = computeBmi(170, 65);
    expect(result.bmi).toBeCloseTo(22.5, 1);
    expect(result.category).toBe("normal");
  });

  it("classifies underweight and obese ranges", () => {
    expect(computeBmi(170, 50).category).toBe("underweight");
    expect(computeBmi(170, 100).category).toBe("obese");
  });
});
