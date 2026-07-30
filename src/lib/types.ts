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
  activity_level: string;
  target_calories: number | null;
  budget_usd: number | null;
  preferred_foods: string[];
  disliked_foods: string[];
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

export interface DetectedIngredient {
  name: string;
  estimated_quantity: string;
  confidence: number;
}

export interface IngredientDetectionResult {
  ingredients: DetectedIngredient[];
  cooking_method: string;
  kitchen_tools: string[];
}

export interface RecipeNutrition {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber?: number;
  sodium?: number;
}

export interface SpoonacularRecipeCandidate {
  id: number;
  title: string;
  image: string;
  readyInMinutes: number;
  servings: number;
  sourceUrl?: string;
  summary?: string;
  cuisines: string[];
  diets: string[];
  dishTypes: string[];
  ingredients: string[];
  instructions: string[];
  nutrition: RecipeNutrition;
  pricePerServing?: number;
  usedIngredientCount?: number;
  missedIngredientCount?: number;
}

export interface RankedRecipeRecommendation {
  id: number;
  title: string;
  image: string;
  score: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  readyInMinutes: number;
  matchedIngredients: string[];
  missingIngredients: string[];
  reason: string;
  /** Cooking steps from Spoonacular search/detail when available. */
  instructions: string[];
  /**
   * Full recipe ingredient lines (often with quantities) from Spoonacular.
   * Distinct from matched/missing name lists used for ranking UX.
   */
  ingredients?: string[];
}

export interface RecipeRecommendResponse {
  recipes: RankedRecipeRecommendation[];
  detection?: IngredientDetectionResult;
  ingredientsUsed: string[];
}

export const MEDICAL_DISCLAIMER =
  "PersonalPlate provides general nutrition support and does not replace medical advice from doctors or registered dietitians.";
