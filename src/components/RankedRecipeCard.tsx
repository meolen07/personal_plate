"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { Card } from "./Card";
import { RecipeImage } from "./RecipeImage";
import {
  hasEnoughCookingSteps,
  normalizeDisplayInstructions,
  shouldShowRecipeIngredients,
  type DisplayInstruction,
} from "@/lib/recipe-display";
import type { RankedRecipeRecommendation } from "@/lib/types";

interface RankedRecipeCardProps {
  recipe: RankedRecipeRecommendation;
  expanded: boolean;
  onToggle: () => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  onDetailLoaded?: (detail: {
    instructions: string[];
    ingredients?: string[];
    nutrition?: {
      calories: number;
      protein: number;
      fat: number;
      carbs: number;
    };
  }) => void;
}

function hasDisplayableNutrition(recipe: RankedRecipeRecommendation): boolean {
  return (
    recipe.calories > 0 ||
    recipe.protein > 0 ||
    recipe.fat > 0 ||
    recipe.carbs > 0
  );
}

function IngredientTags({
  items,
  tone,
}: {
  items: string[];
  tone: "matched" | "missing";
}) {
  const className =
    tone === "matched"
      ? "rounded-full bg-success-bg px-3 py-1 text-xs font-medium text-success-text"
      : "rounded-full bg-warning-bg px-3 py-1 text-xs font-medium text-warning-text";

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((ing, i) => (
        <span key={`${ing}-${i}`} className={className}>
          {ing}
        </span>
      ))}
    </div>
  );
}

function NutritionSummary({ recipe }: { recipe: RankedRecipeRecommendation }) {
  if (!hasDisplayableNutrition(recipe)) {
    return (
      <span className="rounded-full bg-sand px-3 py-1 text-neutral/60">
        Nutrition unavailable
      </span>
    );
  }

  return (
    <>
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
    </>
  );
}

function NutritionBlock({ recipe }: { recipe: RankedRecipeRecommendation }) {
  const available = hasDisplayableNutrition(recipe);

  return (
    <section>
      <h4 className="mb-2 text-sm font-semibold text-dark-green">Nutrition</h4>
      {available ? (
        <dl className="grid grid-cols-2 gap-2 text-sm text-neutral/80 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-neutral/55">Calories</dt>
            <dd className="font-medium text-neutral/90">{recipe.calories} kcal</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral/55">Protein</dt>
            <dd className="font-medium text-neutral/90">{recipe.protein}g</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral/55">Fat</dt>
            <dd className="font-medium text-neutral/90">{recipe.fat}g</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral/55">Carbs</dt>
            <dd className="font-medium text-neutral/90">{recipe.carbs}g</dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-neutral/60">Nutrition unavailable</p>
      )}
    </section>
  );
}

function InstructionsList({ items }: { items: DisplayInstruction[] }) {
  if (items.length === 0) return null;

  return (
    <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-neutral/80">
      {items.map((item, i) => (
        <li key={i} className="pl-1">
          {item.kind === "video" ? (
            item.href ? (
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-usf-green underline underline-offset-2"
              >
                {item.label}
              </a>
            ) : (
              <span className="font-medium text-neutral/70">{item.label}</span>
            )
          ) : (
            item.text
          )}
        </li>
      ))}
    </ol>
  );
}

function parseNutritionPayload(data: unknown): {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
} | null {
  if (!data || typeof data !== "object") return null;
  const n = data as Record<string, unknown>;
  const calories = typeof n.calories === "number" ? n.calories : Number(n.calories);
  const protein = typeof n.protein === "number" ? n.protein : Number(n.protein);
  const fat = typeof n.fat === "number" ? n.fat : Number(n.fat);
  const carbs = typeof n.carbs === "number" ? n.carbs : Number(n.carbs);
  if (
    ![calories, protein, fat, carbs].every((v) => Number.isFinite(v)) ||
    (calories <= 0 && protein <= 0 && fat <= 0 && carbs <= 0)
  ) {
    return null;
  }
  return {
    calories: Math.round(calories),
    protein: Math.round(protein),
    fat: Math.round(fat),
    carbs: Math.round(carbs),
  };
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
  const detailFetchedForIdRef = useRef<number | null>(null);

  useEffect(() => {
    onDetailLoadedRef.current = onDetailLoaded;
  }, [onDetailLoaded]);

  const displayInstructions = normalizeDisplayInstructions(recipe.instructions);
  const instructionsUsable = hasEnoughCookingSteps(displayInstructions);
  const missingInstructions =
    recipe.instructions.length === 0 || !instructionsUsable;
  const missingIngredients =
    !recipe.ingredients || recipe.ingredients.length === 0;
  const missingNutrition = !hasDisplayableNutrition(recipe);
  const needsDetailFetch =
    recipe.id > 0 &&
    (missingInstructions || missingIngredients || missingNutrition);

  useEffect(() => {
    if (!expanded || !needsDetailFetch) {
      return;
    }

    if (detailFetchedForIdRef.current === recipe.id) {
      return;
    }

    let cancelled = false;
    detailFetchedForIdRef.current = recipe.id;

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
              : "Unable to load recipe details right now."
          );
          return;
        }

        const steps = Array.isArray(data.instructions)
          ? data.instructions.filter(
              (step: unknown): step is string =>
                typeof step === "string" && Boolean(step.trim())
            )
          : [];
        const ingredients = Array.isArray(data.ingredients)
          ? data.ingredients.filter(
              (ing: unknown): ing is string =>
                typeof ing === "string" && Boolean(ing.trim())
            )
          : [];
        const nutrition = parseNutritionPayload(data.nutrition);

        if (steps.length === 0 && ingredients.length === 0 && !nutrition) {
          setDetailError("Cooking details are not available for this recipe.");
          return;
        }

        onDetailLoadedRef.current?.({
          instructions: steps,
          ingredients,
          nutrition: nutrition ?? undefined,
        });
      } catch {
        if (!cancelled) {
          setDetailError(
            "Unable to load recipe details. Please check your connection and try again."
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
  }, [expanded, recipe.id, needsDetailFetch]);

  const matched = recipe.matchedIngredients.filter(Boolean);
  const missing = recipe.missingIngredients.filter(Boolean);
  const recipeIngredients = shouldShowRecipeIngredients(
    recipe.ingredients,
    matched,
    missing
  );

  return (
    <Card className="h-auto w-full overflow-hidden p-0">
      <button type="button" onClick={onToggle} className="block w-full text-left">
        <div className="relative overflow-hidden bg-sand">
          <RecipeImage
            src={recipe.image}
            alt={recipe.title}
            className="h-44 w-full object-cover sm:h-56"
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
            {!expanded && (
              <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-neutral/70">
                {recipe.reason}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <NutritionSummary recipe={recipe} />
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
        <div className="w-full space-y-5 border-t border-light-border p-5">
          <section>
            <h4 className="mb-1 text-sm font-semibold text-dark-green">
              Why it matches
            </h4>
            <p className="whitespace-pre-line text-sm leading-relaxed text-neutral/80">
              {recipe.reason}
            </p>
          </section>

          <NutritionBlock recipe={recipe} />

          <section>
            <h4 className="mb-2 text-sm font-semibold text-dark-green">
              Matched ingredients
            </h4>
            {matched.length === 0 ? (
              <p className="text-sm text-neutral/60">None matched</p>
            ) : (
              <IngredientTags items={matched} tone="matched" />
            )}
          </section>

          {missing.length > 0 && (
            <section>
              <h4 className="mb-2 text-sm font-semibold text-dark-green">
                Missing ingredients
              </h4>
              <IngredientTags items={missing} tone="missing" />
            </section>
          )}

          {recipeIngredients.length > 0 && (
            <section>
              <h4 className="mb-2 text-sm font-semibold text-dark-green">
                Recipe ingredients
              </h4>
              <ul className="list-disc space-y-1 pl-5 text-sm text-neutral/80">
                {recipeIngredients.map((ing, i) => (
                  <li key={i}>{ing}</li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h4 className="mb-2 text-sm font-semibold text-dark-green">
              Instructions
            </h4>
            {instructionsUsable ? (
              <InstructionsList items={displayInstructions} />
            ) : detailLoading ? (
              <p className="text-sm text-neutral/60">Loading cooking steps...</p>
            ) : detailError ? (
              <p className="text-sm text-neutral/60">{detailError}</p>
            ) : (
              <p className="text-sm text-neutral/60">
                Cooking steps are not available for this recipe.
              </p>
            )}
          </section>

          <div>
            <Button onClick={onSave} disabled={saving || saved}>
              {saved ? "Saved!" : saving ? "Saving..." : "Save Recipe"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
