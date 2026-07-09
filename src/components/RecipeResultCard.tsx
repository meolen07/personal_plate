import { Button } from "./Button";
import { Card } from "./Card";
import { RecipeImage } from "./RecipeImage";
import type { RecommendedRecipe } from "@/lib/types";

interface RecipeResultCardProps {
  recipe: RecommendedRecipe;
  expanded: boolean;
  onToggle: () => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}

export function RecipeResultCard({
  recipe,
  expanded,
  onToggle,
  onSave,
  saving,
  saved,
}: RecipeResultCardProps) {
  return (
    <Card className="overflow-hidden p-0">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <div className="relative overflow-hidden bg-sand">
          <RecipeImage
            src={recipe.image_url}
            alt={`AI illustration of ${recipe.title}`}
            className="h-56 w-full object-cover"
          />
          <span className="absolute right-3 top-3 rounded-full bg-usf-green/90 px-3 py-1 text-xs font-medium text-white">
            AI image
          </span>
        </div>

        <div className="space-y-3 p-5">
          <div>
            <h3 className="text-lg font-semibold text-dark-green">
              {recipe.title}
            </h3>
            <p className="mt-1 text-sm text-neutral/70">{recipe.description}</p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-sand px-3 py-1 text-neutral/80">
              Servings: {recipe.servings}
            </span>
            <span className="rounded-full bg-sand px-3 py-1 text-neutral/80">
              Prep: {recipe.prep_time_minutes} min
            </span>
            <span className="rounded-full bg-sand px-3 py-1 text-neutral/80">
              Cook: {recipe.cook_time_minutes} min
            </span>
            {recipe.safety_notes.length > 0 && (
              <span className="rounded-full bg-warning-bg px-3 py-1 text-warning-text">
                {recipe.safety_notes.length} safety note
                {recipe.safety_notes.length !== 1 ? "s" : ""}
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
              <h3 className="mb-2 font-semibold text-dark-green">Ingredients</h3>
              <ul className="list-inside list-disc space-y-1 text-sm">
                {recipe.ingredients.map((ing, i) => (
                  <li key={i}>{ing}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 font-semibold text-dark-green">Instructions</h3>
              <ol className="list-inside list-decimal space-y-2 text-sm">
                {recipe.instructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          </div>

          {recipe.nutrition_notes && (
            <div className="mt-4 rounded-lg bg-success-bg p-3">
              <h3 className="text-sm font-semibold text-success-text">
                Nutrition Notes
              </h3>
              <p className="mt-1 text-sm text-success-text/90">
                {recipe.nutrition_notes}
              </p>
            </div>
          )}

          {recipe.safety_notes.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-dark-green">
                Safety Notes
              </h3>
              <ul className="list-inside list-disc space-y-1 text-sm text-neutral/80">
                {recipe.safety_notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}

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
