export type BmiCategory =
  | "underweight"
  | "normal"
  | "overweight"
  | "obese"
  | "unknown";

export interface BmiResult {
  bmi: number | null;
  category: BmiCategory;
  label: string;
}

export function computeBmi(
  heightCm: number | null | undefined,
  weightKg: number | null | undefined
): BmiResult {
  if (
    heightCm == null ||
    weightKg == null ||
    !Number.isFinite(heightCm) ||
    !Number.isFinite(weightKg) ||
    heightCm <= 0 ||
    weightKg <= 0
  ) {
    return { bmi: null, category: "unknown", label: "Not enough data" };
  }

  const heightM = heightCm / 100;
  const bmi = Math.round((weightKg / (heightM * heightM)) * 10) / 10;

  if (bmi < 18.5) {
    return { bmi, category: "underweight", label: "Underweight" };
  }
  if (bmi < 25) {
    return { bmi, category: "normal", label: "Normal weight" };
  }
  if (bmi < 30) {
    return { bmi, category: "overweight", label: "Overweight" };
  }
  return { bmi, category: "obese", label: "Obese" };
}
