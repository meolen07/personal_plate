import { createClient } from "@/lib/supabase/server";
import type { FridgeItem, Profile, SavedRecipe } from "@/lib/types";

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return data as Profile;
}

export async function upsertProfile(
  userId: string,
  profile: Omit<Profile, "id" | "user_id" | "updated_at">
): Promise<{ data: Profile | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: userId,
        ...profile,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as Profile, error: null };
}

export async function getRecipes(
  userId: string,
  limit?: number
): Promise<SavedRecipe[]> {
  const supabase = await createClient();
  let query = supabase
    .from("recipes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data as SavedRecipe[];
}

export async function getFridgeItems(userId: string): Promise<FridgeItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fridge_items")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as FridgeItem[];
}

export async function saveRecipe(
  userId: string,
  recipe: {
    desired_dish: string;
    available_ingredients: string[];
    generated_recipe: SavedRecipe["generated_recipe"];
    warnings: string[];
    substitutions: SavedRecipe["substitutions"];
  }
): Promise<{ data: SavedRecipe | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .insert({
      user_id: userId,
      ...recipe,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as SavedRecipe, error: null };
}
