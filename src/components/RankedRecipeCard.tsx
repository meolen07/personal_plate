"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { Card } from "./Card";
import { RecipeImage } from "./RecipeImage";
import {
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
  }) => void;
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

  const missingInstructions = recipe.instructions.length === 0;
  const missingIngredients =
    !recipe.ingredients || recipe.ingredients.length === 0;
  const needsDetailFetch =
    recipe.id > 0 && (missingInstructions || missingIngredients);

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

        if (steps.length === 0 && ingredients.length === 0) {
          setDetailError("Cooking details are not available for this recipe.");
          return;
        }

        onDetailLoadedRef.current?.({
          instructions: steps,
          ingredients,
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
  const displayInstructions = normalizeDisplayInstructions(recipe.instructions);

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
              <p className="mt-1 line-clamp-2 text-sm text-neutral/70">
                {recipe.reason}
              </p>
            )}
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
        <div className="w-full space-y-5 border-t border-light-border p-5">
          <section>
            <h4 className="mb-1 text-sm font-semibold text-dark-green">
              Why it matches
            </h4>
            <p className="text-sm leading-relaxed text-neutral/80">
              {recipe.reason}
            </p>
          </section>

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
            {displayInstructions.length > 0 ? (
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
