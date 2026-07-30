"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { FormField, Input, Textarea } from "@/components/FormField";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { RankedRecipeCard } from "@/components/RankedRecipeCard";
import { VirtualFridge } from "@/components/VirtualFridge";
import { assessProfileForRanking } from "@/lib/profile-rank-readiness";
import { toRecommendedRecipeFromRanked } from "@/lib/save-ranked-recipe";
import { createClient } from "@/lib/supabase/client";
import { parseCommaSeparated } from "@/lib/utils";
import type {
  IngredientDetectionResult,
  Profile,
  RankedRecipeRecommendation,
} from "@/lib/types";

function mergeIngredientLists(existing: string[], detected: string[]): string[] {
  const merged = [...existing];
  for (const name of detected) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    if (
      merged.some((item) => item.toLowerCase() === trimmed.toLowerCase())
    ) {
      continue;
    }
    merged.push(trimmed);
  }
  return merged;
}

export function PersonalizedRankPanel() {
  const [ingredients, setIngredients] = useState("");
  const [includeFridge, setIncludeFridge] = useState(true);
  const [maxReadyTime, setMaxReadyTime] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<RankedRecipeRecommendation[]>([]);
  const [detection, setDetection] = useState<IngredientDetectionResult | null>(
    null
  );
  const [ingredientsUsed, setIngredientsUsed] = useState<string[]>([]);
  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedTitles, setSavedTitles] = useState<string[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user || cancelled) {
          if (!cancelled) setProfileChecked(true);
          return;
        }

        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!cancelled) {
          setProfile((data as Profile | null) ?? null);
          setProfileChecked(true);
        }
      } catch {
        if (!cancelled) {
          setProfile(null);
          setProfileChecked(true);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  const profileReadiness = assessProfileForRanking(profile);
  const busy = loading || detecting;

  const handleUseFridgeIngredients = (fridgeItems: string[]) => {
    setIngredients(fridgeItems.join(", "));
    setError(null);
    setEmptyMessage(null);
  };

  const handleUseDetectedIngredients = () => {
    if (!detection?.ingredients.length) return;
    const detectedNames = detection.ingredients.map((item) => item.name);
    setIngredients((current) =>
      mergeIngredientLists(parseCommaSeparated(current), detectedNames).join(
        ", "
      )
    );
    setError(null);
    setEmptyMessage(null);
  };

  const handleDetailLoaded = useCallback(
    (recipeKey: string, detail: { instructions: string[] }) => {
      setRecipes((current) =>
        current.map((recipe) =>
          `${recipe.title}-${recipe.score}` === recipeKey
            ? { ...recipe, instructions: detail.instructions }
            : recipe
        )
      );
    },
    []
  );

  const handleDetectVideo = async () => {
    if (!videoFile) {
      setError(
        "Choose a short kitchen or fridge video first (mp4, mov, or webm)."
      );
      return;
    }

    setDetecting(true);
    setError(null);
    setEmptyMessage(null);
    setDetection(null);

    try {
      const formData = new FormData();
      formData.append("video", videoFile);

      const response = await fetch("/api/ingredients/detect", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Failed to detect ingredients from video."
        );
        return;
      }

      const result =
        data && typeof data === "object"
          ? (data as IngredientDetectionResult)
          : null;

      if (!result || !Array.isArray(result.ingredients)) {
        setError("Computer vision returned an unexpected response.");
        return;
      }

      setDetection({
        ingredients: result.ingredients,
        cooking_method:
          typeof result.cooking_method === "string"
            ? result.cooking_method
            : "none visible",
        kitchen_tools: Array.isArray(result.kitchen_tools)
          ? result.kitchen_tools.filter(
              (tool): tool is string => typeof tool === "string"
            )
          : [],
      });
    } catch {
      setError(
        "Unable to run computer vision right now. Please check your connection and try again."
      );
    } finally {
      setDetecting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setEmptyMessage(null);
    setRecipes([]);
    setDetection(null);
    setIngredientsUsed([]);
    setExpandedRecipe(null);
    setSavedTitles([]);

    try {
      const manualIngredients = parseCommaSeparated(ingredients);
      let response: Response;

      if (videoFile) {
        const formData = new FormData();
        formData.append("video", videoFile);
        if (manualIngredients.length > 0) {
          formData.append("ingredients", JSON.stringify(manualIngredients));
        }
        formData.append("includeFridge", includeFridge ? "true" : "false");
        if (maxReadyTime.trim()) {
          formData.append("maxReadyTime", maxReadyTime.trim());
        }
        response = await fetch("/api/recipes/recommend", {
          method: "POST",
          body: formData,
        });
      } else {
        response = await fetch("/api/recipes/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ingredients: manualIngredients,
            includeFridge,
            maxReadyTime: maxReadyTime.trim()
              ? Number(maxReadyTime)
              : undefined,
          }),
        });
      }

      const data = await response.json();
      if (!response.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Failed to recommend recipes."
        );
        return;
      }

      const ranked = Array.isArray(data.recipes)
        ? (data.recipes as RankedRecipeRecommendation[]).map((recipe) => ({
            ...recipe,
            id: typeof recipe.id === "number" ? recipe.id : 0,
            instructions: Array.isArray(recipe.instructions)
              ? recipe.instructions.filter(
                  (step): step is string => typeof step === "string"
                )
              : [],
          }))
        : [];
      setRecipes(ranked);
      setDetection(
        data.detection && typeof data.detection === "object"
          ? (data.detection as IngredientDetectionResult)
          : null
      );
      setIngredientsUsed(
        Array.isArray(data.ingredientsUsed)
          ? (data.ingredientsUsed as string[])
          : []
      );
      setExpandedRecipe(
        ranked[0] ? `${ranked[0].title}-${ranked[0].score}` : null
      );

      if (ranked.length === 0) {
        setEmptyMessage(
          "No matching recipes were found. Try different ingredients, enable your Virtual Fridge, or upload a clearer kitchen video."
        );
      }
    } catch {
      setError(
        "Unable to recommend recipes right now. Please check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (recipe: RankedRecipeRecommendation) => {
    setSaving(true);
    setError(null);

    try {
      const available =
        ingredientsUsed.length > 0
          ? ingredientsUsed
          : parseCommaSeparated(ingredients);

      const response = await fetch("/api/save-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          desired_dish: recipe.title,
          available_ingredients: available,
          generated_recipe: toRecommendedRecipeFromRanked(recipe),
          warnings: [],
          substitutions: [],
          source: "ranked",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Failed to save recipe."
        );
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

  return (
    <>
      <p className="mb-6 text-neutral/70">
        Use computer vision on a short kitchen/fridge video to detect
        ingredients, and/or type them manually. PersonalPlate then searches
        Spoonacular candidates, fills nutrition gaps with USDA when needed, and
        ranks the best matches for your health profile.
      </p>

      {profileChecked && profileReadiness.status === "missing" && (
        <Alert variant="warning" title="Profile needed" className="mb-6">
          <p>{profileReadiness.message}</p>
          <Link
            href="/profile"
            className="mt-2 inline-block text-sm font-medium underline underline-offset-2"
          >
            Set up your profile
          </Link>
        </Alert>
      )}

      {profileChecked && profileReadiness.status === "thin" && (
        <Alert variant="warning" title="Incomplete profile" className="mb-6">
          <p>{profileReadiness.message}</p>
          <Link
            href="/profile"
            className="mt-2 inline-block text-sm font-medium underline underline-offset-2"
          >
            Update your profile
          </Link>
        </Alert>
      )}

      <VirtualFridge compact onUseIngredients={handleUseFridgeIngredients} />

      <Card className="mb-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          <FormField
            label="Computer vision video (optional)"
            id="video"
            hint="Short fridge or cooking clip — mp4, mov, or webm, max about 20MB. Gemini vision extracts ingredients with quantity and confidence."
          >
            <Input
              id="video"
              type="file"
              accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
              onChange={(e) => {
                setVideoFile(e.target.files?.[0] ?? null);
                setDetection(null);
                setEmptyMessage(null);
              }}
            />
            {videoFile && (
              <p className="mt-1 text-xs text-neutral/70">
                Selected: {videoFile.name} (
                {(videoFile.size / (1024 * 1024)).toFixed(1)} MB)
              </p>
            )}
          </FormField>

          <FormField
            label="Manual Ingredients (optional)"
            id="ranked-ingredients"
            hint="Comma-separated. Combined with computer vision detection and fridge when enabled."
          >
            <Textarea
              id="ranked-ingredients"
              value={ingredients}
              onChange={(e) => setIngredients(e.target.value)}
              rows={3}
              placeholder="chicken breast, broccoli, garlic"
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Max Ready Time (minutes)"
              id="maxReadyTime"
              hint="Optional upper bound for cook time"
            >
              <Input
                id="maxReadyTime"
                type="number"
                min={5}
                max={240}
                value={maxReadyTime}
                onChange={(e) => setMaxReadyTime(e.target.value)}
                placeholder="35"
              />
            </FormField>

            <div className="flex items-end">
              <label className="flex items-center gap-2 pb-2 text-sm text-neutral/80">
                <input
                  type="checkbox"
                  checked={includeFridge}
                  onChange={(e) => setIncludeFridge(e.target.checked)}
                  className="h-4 w-4 rounded border-light-border text-usf-green focus:ring-usf-green"
                />
                Include Virtual Fridge ingredients
              </label>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !videoFile}
              className="w-full"
              onClick={() => void handleDetectVideo()}
            >
              {detecting
                ? "Scanning video..."
                : "Detect ingredients (computer vision)"}
            </Button>
            <Button type="submit" disabled={busy} className="w-full">
              {loading ? "Finding recipes..." : "Discover Recipes"}
            </Button>
          </div>
        </form>
      </Card>

      {detecting && (
        <LoadingSpinner message="Running computer vision on your kitchen video..." />
      )}

      {loading && (
        <LoadingSpinner message="Reviewing your ingredients and profile to rank personalized recipes..." />
      )}

      {error && (
        <Alert variant="danger" title="Error" className="mb-6">
          {error}
        </Alert>
      )}

      {emptyMessage && !error && (
        <Alert variant="warning" title="No recipes found" className="mb-6">
          {emptyMessage}
        </Alert>
      )}

      {detection && (
        <Alert variant="success" title="Computer vision results" className="mb-6">
          <p className="text-sm">
            Method: {detection.cooking_method || "none visible"}
          </p>
          {detection.kitchen_tools.length > 0 && (
            <p className="mt-1 text-sm">
              Tools: {detection.kitchen_tools.join(", ")}
            </p>
          )}
          {detection.ingredients.length > 0 ? (
            <>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                {detection.ingredients.map((item, index) => (
                  <li key={`${item.name}-${index}`}>
                    {item.name}
                    {item.estimated_quantity
                      ? ` (${item.estimated_quantity})`
                      : ""}{" "}
                    — confidence {Math.round(item.confidence * 100)}%
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={handleUseDetectedIngredients}
              >
                Add detected ingredients to list
              </Button>
            </>
          ) : (
            <p className="mt-2 text-sm">
              No edible ingredients were visible. Try a clearer fridge or
              countertop clip, or type ingredients manually.
            </p>
          )}
        </Alert>
      )}

      {ingredientsUsed.length > 0 && (
        <p className="mb-4 text-sm text-neutral/70">
          Ingredients used: {ingredientsUsed.join(", ")}
        </p>
      )}

      {recipes.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {recipes.map((recipe) => {
            const recipeKey = `${recipe.title}-${recipe.score}`;
            const saved = savedTitles.includes(recipe.title);
            return (
              <RankedRecipeCard
                key={recipeKey}
                recipe={recipe}
                expanded={expandedRecipe === recipeKey}
                onToggle={() =>
                  setExpandedRecipe((current) =>
                    current === recipeKey ? null : recipeKey
                  )
                }
                onSave={() => handleSave(recipe)}
                saving={saving}
                saved={saved}
                onDetailLoaded={(detail) =>
                  handleDetailLoaded(recipeKey, detail)
                }
              />
            );
          })}
        </div>
      )}
    </>
  );
}
