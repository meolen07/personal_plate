"use client";

import { useState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { FormField, Textarea } from "@/components/FormField";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { RecipeResultCard } from "@/components/RecipeResultCard";
import { VirtualFridge } from "@/components/VirtualFridge";
import { createClient } from "@/lib/supabase/client";
import { uploadRecipeImageFromBrowser } from "@/lib/recipe-images-client";
import { parseCommaSeparated } from "@/lib/utils";
import type { RecommendedRecipe, RecipeResponse } from "@/lib/types";
import { MEDICAL_DISCLAIMER } from "@/lib/types";

export default function RecommendPage() {
  const [ingredients, setIngredients] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecipeResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedTitles, setSavedTitles] = useState<string[]>([]);
  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setSavedTitles([]);
    setExpandedRecipe(null);

    try {
      const response = await fetch("/api/generate-recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          availableIngredients: parseCommaSeparated(ingredients),
          optionalNotes: notes || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to generate recommendations.");
        return;
      }

      const parsed = data as RecipeResponse;
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("You must be signed in to generate recipe images.");
        return;
      }

      const imageResults = await Promise.allSettled(
        parsed.recommended_recipes.map((recipe) =>
          uploadRecipeImageFromBrowser(
            user.id,
            recipe.image_prompt || recipe.title,
            recipe.title
          )
        )
      );

      const recipesWithImages = parsed.recommended_recipes.map((recipe, index) => ({
        ...recipe,
        image_url:
          imageResults[index]?.status === "fulfilled"
            ? imageResults[index].value
            : "",
      }));

      const failedImageCount = imageResults.filter(
        (result) => result.status === "rejected"
      ).length;

      const completedResult: RecipeResponse = {
        ...parsed,
        recommended_recipes: recipesWithImages,
      };

      if (failedImageCount > 0) {
        setError(
          failedImageCount === parsed.recommended_recipes.length
            ? "Meal suggestions were generated, but recipe images are temporarily unavailable."
            : "Some recipe images are temporarily unavailable."
        );
      }

      setResult(completedResult);
      setExpandedRecipe(completedResult.recommended_recipes[0]?.title ?? null);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(
          "Unable to generate recommendations or recipe images right now."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (recipe: RecommendedRecipe) => {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/save-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          desired_dish: recipe.title,
          available_ingredients: parseCommaSeparated(ingredients),
          generated_recipe: recipe,
          warnings: result?.warnings,
          substitutions: result?.substitutions,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to save recipe.");
        return;
      }

      setSavedTitles((current) =>
        current.includes(recipe.title) ? current : [...current, recipe.title]
      );
    } catch {
      setError("Failed to save recipe. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleUseFridgeIngredients = (fridgeItems: string[]) => {
    setIngredients(fridgeItems.join(", "));
    setError(null);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="mb-2 text-2xl font-bold text-dark-green sm:text-3xl">
        Get Meal Suggestions
      </h1>
      <p className="mb-6 text-neutral/70">
        Enter the ingredients you already have. PersonalPlate will suggest
        multiple dishes that fit your available ingredients and health profile,
        then flag risks and suggest safer substitutions.
      </p>

      <Alert variant="info" className="mb-6">
        {MEDICAL_DISCLAIMER}
      </Alert>

      <VirtualFridge
        compact
        onUseIngredients={handleUseFridgeIngredients}
      />

      <Card className="mb-8">
        <form onSubmit={handleGenerate} className="space-y-5">
          <FormField
            label="Available Ingredients"
            id="ingredients"
            hint="Comma-separated list of ingredients you have on hand"
          >
            <Textarea
              id="ingredients"
              value={ingredients}
              onChange={(e) => setIngredients(e.target.value)}
              required
              rows={4}
              placeholder="chicken breast, broccoli, soy sauce, garlic, olive oil"
            />
          </FormField>

          <FormField
            label="Meal Preferences (optional)"
            id="notes"
            hint="Extra goals for this suggestion, such as quick prep or lighter meals"
          >
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Quick dinner, high protein, kid-friendly, low sodium..."
            />
          </FormField>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Generating..." : "Suggest Meals"}
          </Button>
        </form>
      </Card>

      {loading && (
        <LoadingSpinner message="Reviewing your ingredients and profile to suggest personalized meals..." />
      )}

      {error && (
        <Alert variant="danger" title="Error" className="mb-6">
          {error}
        </Alert>
      )}

      {result && (
        <div className="space-y-4">
          {result.risk_detected && result.unsafe_ingredients.length > 0 && (
            <Alert variant="danger" title="Unsafe Ingredients Detected">
              <ul className="mt-2 list-inside list-disc space-y-1">
                {result.unsafe_ingredients.map((item, i) => (
                  <li key={i}>
                    <strong>{item.ingredient}</strong> ({item.severity}):{" "}
                    {item.reason}
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          {result.substitutions.length > 0 && (
            <Alert variant="warning" title="Suggested Substitutions">
              <ul className="mt-2 list-inside list-disc space-y-1">
                {result.substitutions.map((sub, i) => (
                  <li key={i}>
                    Replace <strong>{sub.original}</strong> with{" "}
                    <strong>{sub.substitute}</strong> — {sub.reason}
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          {result.warnings.length > 0 && (
            <Alert variant="warning" title="Warnings">
              <ul className="mt-2 list-inside list-disc space-y-1">
                {result.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </Alert>
          )}

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {result.recommended_recipes.map((recipe) => {
              const saved = savedTitles.includes(recipe.title);
              const expanded = expandedRecipe === recipe.title;

              return (
                <RecipeResultCard
                  key={recipe.title}
                  recipe={recipe}
                  expanded={expanded}
                  onToggle={() =>
                    setExpandedRecipe((current) =>
                      current === recipe.title ? null : recipe.title
                    )
                  }
                  onSave={() => handleSave(recipe)}
                  saving={saving}
                  saved={saved}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
