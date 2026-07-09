import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getFridgeItems, getProfile, getRecipes } from "@/lib/database";
import { ProfileSummary } from "@/components/ProfileSummary";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Alert } from "@/components/Alert";
import { formatDate } from "@/lib/utils";
import { MEDICAL_DISCLAIMER } from "@/lib/types";

export default async function DashboardPage() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  const recentRecipes = await getRecipes(user.id, 3);
  const fridgeItems = await getFridgeItems(user.id);

  const displayName =
    profile?.full_name || user.user_metadata?.full_name || user.email;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-dark-green sm:text-3xl">
          Welcome back{displayName ? `, ${displayName}` : ""}
        </h1>
        <p className="mt-1 text-neutral/70">
          Your personalized meal suggestion dashboard
        </p>
      </div>

      <Alert variant="info" className="mb-8">
        {MEDICAL_DISCLAIMER}
      </Alert>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <ProfileSummary profile={profile} />

          <Card
            title="Virtual Fridge"
            subtitle="Your saved ingredients live separately from your personalization profile"
          >
            <p className="text-sm text-neutral/70">
              {fridgeItems.length === 0
                ? "No ingredients saved yet."
                : `${fridgeItems.length} ingredients currently saved in your fridge.`}
            </p>
            <Link href="/fridge" className="mt-4 inline-block">
              <Button size="sm" variant="secondary">
                Open Fridge
              </Button>
            </Link>
          </Card>

          <Card title="Quick Actions">
            <div className="grid gap-3 sm:grid-cols-4">
              <Link href="/recommend">
                <Button className="w-full">Suggest a Meal</Button>
              </Link>
              <Link href="/fridge">
                <Button variant="secondary" className="w-full">
                  Manage Fridge
                </Button>
              </Link>
              <Link href="/profile">
                <Button variant="secondary" className="w-full">
                  Edit Profile
                </Button>
              </Link>
              <Link href="/history">
                <Button variant="secondary" className="w-full">
                  View History
                </Button>
              </Link>
            </div>
          </Card>
        </div>

        <div>
          <Card title="Recent Recipes" subtitle="Your latest recommendations">
            {recentRecipes.length === 0 ? (
              <div className="py-4 text-center">
                <p className="text-sm text-neutral/70">
                  No recipes yet. Get your first meal suggestion!
                </p>
                <Link href="/recommend" className="mt-4 inline-block">
                  <Button size="sm">Suggest a Meal</Button>
                </Link>
              </div>
            ) : (
              <ul className="space-y-3">
                {recentRecipes.map((recipe) => (
                  <li
                    key={recipe.id}
                    className="rounded-lg border border-light-border p-3"
                  >
                    <p className="font-medium text-dark-green">
                      {recipe.generated_recipe.title}
                    </p>
                    <p className="text-xs text-neutral/60">
                      {formatDate(recipe.created_at)}
                    </p>
                  </li>
                ))}
                <li>
                  <Link
                    href="/history"
                    className="text-sm font-medium text-usf-green hover:underline"
                  >
                    View all recipes &rarr;
                  </Link>
                </li>
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
