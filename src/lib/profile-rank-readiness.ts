import type { Profile } from "@/lib/types";

export type ProfileRankReadiness =
  | { status: "missing"; message: string }
  | { status: "thin"; gaps: string[]; message: string }
  | { status: "ready" };

/**
 * Whether the health profile has enough signals for personalized recommendations
 * (nutrition goals, activity, calories, body metrics used in ranking).
 */
export function assessProfileForRanking(
  profile: Profile | null
): ProfileRankReadiness {
  if (!profile || !profile.full_name?.trim()) {
    return {
      status: "missing",
      message:
        "Complete your health profile so recommendations can factor in allergies, diet, and goals.",
    };
  }

  const gaps: string[] = [];
  if (!profile.nutrition_goals?.trim()) {
    gaps.push("nutrition goals");
  }
  if (!profile.activity_level?.trim()) {
    gaps.push("activity level");
  }
  if (profile.target_calories == null) {
    gaps.push("target calories");
  }
  if (profile.height_cm == null || profile.weight_kg == null) {
    gaps.push("height and weight");
  }

  if (gaps.length >= 2) {
    return {
      status: "thin",
      gaps,
      message: `Your profile is missing ${gaps.join(", ")}. Rankings will be less personalized until you fill these in.`,
    };
  }

  return { status: "ready" };
}
