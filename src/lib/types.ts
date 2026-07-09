export interface Profile {
  id?: string;
  user_id?: string;
  full_name: string;
  age: number | null;
  gender: string;
  height_cm: number | null;
  weight_kg: number | null;
  medical_conditions: string[];
  medications: string[];
  allergies: string[];
  dietary_restrictions: string[];
  nutrition_goals: string;
  preferred_cuisine: string;
  updated_at?: string;
}

export interface FridgeItem {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface UnsafeIngredient {
  ingredient: string;
  reason: string;
  severity: "low" | "medium" | "high";
}

export interface Substitution {
  original: string;
  substitute: string;
  reason: string;
}

export interface RecommendedRecipe {
  title: string;
  description: string;
  image_prompt: string;
  image_url: string;
  servings: number;
  prep_time_minutes: number;
  cook_time_minutes: number;
  ingredients: string[];
  instructions: string[];
  nutrition_notes: string;
  safety_notes: string[];
}

export interface RecipeResponse {
  risk_detected: boolean;
  unsafe_ingredients: UnsafeIngredient[];
  substitutions: Substitution[];
  recommended_recipes: RecommendedRecipe[];
  warnings: string[];
}

export interface SavedRecipe {
  id: string;
  user_id: string;
  desired_dish: string;
  available_ingredients: string[];
  generated_recipe: RecommendedRecipe;
  warnings: string[];
  substitutions: Substitution[];
  created_at: string;
}

export const MEDICAL_DISCLAIMER =
  "PersonalPlate provides general nutrition support and does not replace medical advice from doctors or registered dietitians.";
