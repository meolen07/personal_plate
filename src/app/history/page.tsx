import Image from "next/image";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getRecipes } from "@/lib/database";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { formatDate } from "@/lib/utils";
import { MEDICAL_DISCLAIMER } from "@/lib/types";

export default async function HistoryPage() {
  const user = await requireUser();
  const recipes = await getRecipes(user.id);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-green sm:text-3xl">
            Recipe History
          </h1>
          <p className="mt-1 text-neutral/70">
            Your saved AI meal suggestions
          </p>
        </div>
        <Link href="/recommend">
          <Button>New Recommendation</Button>
        </Link>
      </div>

      <Alert variant="info" className="mb-8">
        {MEDICAL_DISCLAIMER}
      </Alert>

      {recipes.length === 0 ? (
        <div className="text-center">
          <EmptyState
            title="No saved recipes yet"
            description="Generate a personalized meal suggestion from your available ingredients and save it to build your recipe history."
            icon="📖"
          />
          <Link href="/recommend" className="mt-4 inline-block">
            <Button>Suggest a Meal</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {recipes.map((recipe) => (
            <Card key={recipe.id}>
              {recipe.generated_recipe.image_url && (
                <div className="mb-4 overflow-hidden rounded-xl border border-light-border bg-sand">
                  <Image
                    src={recipe.generated_recipe.image_url}
                    alt={`AI illustration of ${recipe.generated_recipe.title}`}
                    width={1024}
                    height={768}
                    className="h-56 w-full object-cover"
                  />
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-dark-green">
                    {recipe.generated_recipe.title}
                  </h2>
                  <p className="text-sm text-neutral/60">
                    Suggested dish: {recipe.desired_dish} &middot;{" "}
                    {formatDate(recipe.created_at)}
                  </p>
                </div>
                {recipe.warnings.length > 0 && (
                  <span className="inline-flex shrink-0 rounded-full bg-warning-bg px-3 py-1 text-xs font-medium text-warning-text">
                    {recipe.warnings.length} warning
                    {recipe.warnings.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              <p className="mt-2 text-sm text-neutral/70">
                {recipe.generated_recipe.description}
              </p>

              <div className="mt-3 flex flex-wrap gap-4 text-xs text-neutral/60">
                <span>Servings: {recipe.generated_recipe.servings}</span>
                <span>
                  Prep: {recipe.generated_recipe.prep_time_minutes} min
                </span>
                <span>
                  Cook: {recipe.generated_recipe.cook_time_minutes} min
                </span>
              </div>

              {recipe.substitutions.length > 0 && (
                <div className="mt-3 rounded-lg bg-warning-bg/50 p-3">
                  <p className="text-xs font-semibold text-warning-text">
                    Substitutions made:
                  </p>
                  <ul className="mt-1 list-inside list-disc text-xs text-warning-text/90">
                    {recipe.substitutions.map((sub, i) => (
                      <li key={i}>
                        {sub.original} &rarr; {sub.substitute}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-usf-green hover:underline">
                  View full recipe
                </summary>
                <div className="mt-3 grid gap-4 text-sm md:grid-cols-2">
                  <div>
                    <h3 className="font-semibold text-dark-green">
                      Ingredients
                    </h3>
                    <ul className="mt-1 list-inside list-disc">
                      {recipe.generated_recipe.ingredients.map((ing, i) => (
                        <li key={i}>{ing}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold text-dark-green">
                      Instructions
                    </h3>
                    <ol className="mt-1 list-inside list-decimal">
                      {recipe.generated_recipe.instructions.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              </details>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
