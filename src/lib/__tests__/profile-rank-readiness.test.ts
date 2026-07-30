import { describe, expect, it } from "vitest";
import { assessProfileForRanking } from "@/lib/profile-rank-readiness";
import type { Profile } from "@/lib/types";

const completeProfile: Profile = {
  full_name: "Alex",
  age: 30,
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
  disliked_foods: [],
};

describe("assessProfileForRanking", () => {
  it("flags a missing profile", () => {
    const result = assessProfileForRanking(null);
    expect(result.status).toBe("missing");
    if (result.status === "missing") {
      expect(result.message).toMatch(/health profile/i);
    }
  });

  it("flags a profile without a name as missing", () => {
    const result = assessProfileForRanking({
      ...completeProfile,
      full_name: "  ",
    });
    expect(result.status).toBe("missing");
  });

  it("flags thin profiles missing multiple ranking signals", () => {
    const result = assessProfileForRanking({
      ...completeProfile,
      nutrition_goals: "",
      activity_level: "",
      target_calories: null,
      height_cm: null,
      weight_kg: null,
    });

    expect(result.status).toBe("thin");
    if (result.status === "thin") {
      expect(result.gaps).toEqual(
        expect.arrayContaining([
          "nutrition goals",
          "activity level",
          "target calories",
          "height and weight",
        ])
      );
      expect(result.message).toMatch(/less personalized/i);
    }
  });

  it("treats a mostly complete profile as ready", () => {
    expect(assessProfileForRanking(completeProfile).status).toBe("ready");
  });

  it("allows a single missing optional signal", () => {
    const result = assessProfileForRanking({
      ...completeProfile,
      target_calories: null,
    });
    expect(result.status).toBe("ready");
  });
});
