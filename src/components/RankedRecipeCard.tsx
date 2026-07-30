"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { Card } from "./Card";
import { RecipeImage } from "./RecipeImage";
import type { RankedRecipeRecommendation } from "@/lib/types";

interface RankedRecipeCardProps {
  recipe: RankedRecipeRecommendation;
  expanded: boolean;
  onToggle: () => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  onDetailLoaded?: (detail: { instructions: string[] }) => void;
}

export function RankedRecipeCard({
  recipe,
  expanded,
  onToggle,
  onSave,
  saving,
  saved,
  onDetailLoaded,
}: RankedRecipeCardProps) {
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const onDetailLoadedRef = useRef(onDetailLoaded);

  useEffect(() => {
    onDetailLoadedRef.current = onDetailLoaded;
  }, [onDetailLoaded]);

  useEffect(() => {
    if (!expanded) {
      return;
    }

    if (recipe.instructions.length > 0 || recipe.id <= 0) {
      return;
    }

    let cancelled = false;

    async function loadDetail() {
      setDetailLoading(true);
      setDetailError(null);

      try {
        const response = await fetch(`/api/recipes/${recipe.id}`);
        const data = await response.json();

        if (cancelled) return;

        if (!response.ok) {
          setDetailError(
            typeof data.error === "string"
              ? data.error
              : "Unable to load cooking steps right now."
          );
          return;
        }

        const steps = Array.isArray(data.instructions)
          ? data.instructions.filter(
              (step: unknown): step is string =>
                typeof step === "string" && Boolean(step.trim())
            )
          : [];

        if (steps.length === 0) {
          setDetailError("Cooking steps are not available for this recipe.");
          return;
        }

        onDetailLoadedRef.current?.({ instructions: steps });
      } catch {
        if (!cancelled) {
          setDetailError(
            "Unable to load cooking steps. Please check your connection and try again."
          );
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [expanded, recipe.id, recipe.instructions.length]);

  return (
    <Card className="overflow-hidden p-0">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <div className="relative overflow-hidden bg-sand">
          <RecipeImage
            src={recipe.image}
            alt={recipe.title}
            className="h-56 w-full object-cover"
          />
          <span className="absolute right-3 top-3 rounded-full bg-usf-green/90 px-3 py-1 text-xs font-medium text-white">
            Score {recipe.score}
          </span>
        </div>

        <div className="space-y-3 p-5">
          <div>
            <h3 className="text-lg font-semibold text-dark-green">
              {recipe.title}
            </h3>
            <p className="mt-1 text-sm text-neutral/70">{recipe.reason}</p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-sand px-3 py-1 text-neutral/80">
              {recipe.calories} kcal
            </span>
            <span className="rounded-full bg-sand px-3 py-1 text-neutral/80">
              P {recipe.protein}g
            </span>
            <span className="rounded-full bg-sand px-3 py-1 text-neutral/80">
              F {recipe.fat}g
            </span>
            <span className="rounded-full bg-sand px-3 py-1 text-neutral/80">
              C {recipe.carbs}g
            </span>
            {recipe.readyInMinutes > 0 && (
              <span className="rounded-full bg-sand px-3 py-1 text-neutral/80">
                {recipe.readyInMinutes} min
              </span>
            )}
          </div>

          <p className="text-sm font-medium text-usf-green">
            {expanded ? "Hide details" : "View full recipe"}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-light-border p-5">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-2 font-semibold text-dark-green">
                Matched ingredients
              </h3>
              {recipe.matchedIngredients.length === 0 ? (
                <p className="text-sm text-neutral/60">None listed</p>
              ) : (
                <ul className="list-inside list-disc space-y-1 text-sm">
                  {recipe.matchedIngredients.map((ing, i) => (
                    <li key={i}>{ing}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-2 font-semibold text-dark-green">
                Missing ingredients
              </h3>
              {recipe.missingIngredients.length === 0 ? (
                <p className="text-sm text-neutral/60">None listed</p>
              ) : (
                <ul className="list-inside list-disc space-y-1 text-sm">
                  {recipe.missingIngredients.map((ing, i) => (
                    <li key={i}>{ing}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-6">
            <h3 className="mb-2 font-semibold text-dark-green">Instructions</h3>
            {recipe.instructions.length > 0 ? (
              <ol className="list-inside list-decimal space-y-2 text-sm">
                {recipe.instructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            ) : detailLoading ? (
              <p className="text-sm text-neutral/60">Loading cooking steps...</p>
            ) : detailError ? (
              <p className="text-sm text-neutral/60">{detailError}</p>
            ) : (
              <p className="text-sm text-neutral/60">
                Cooking steps are not available for this recipe.
              </p>
            )}
          </div>

          <div className="mt-5">
            <Button onClick={onSave} disabled={saving || saved}>
              {saved ? "Saved!" : saving ? "Saving..." : "Save Recipe"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
