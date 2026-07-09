import Link from "next/link";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { MEDICAL_DISCLAIMER } from "@/lib/types";

const features = [
  {
    title: "Allergy-Safe Substitutions",
    description:
      "Automatically detects unsafe ingredients based on your health profile and suggests safe alternatives.",
    icon: "🛡️",
  },
  {
    title: "Personalized Recipes",
    description:
      "AI-generated meal recommendations tailored to your medical conditions, medications, and dietary goals.",
    icon: "🍽️",
  },
  {
    title: "Patient Health Profiles",
    description:
      "Store allergies, conditions, and restrictions in one secure profile for consistent, safer guidance.",
    icon: "📋",
  },
  {
    title: "Recipe History",
    description:
      "Save and revisit past recommendations to build a library of safe meals over time.",
    icon: "📚",
  },
];

const steps = [
  {
    step: "1",
    title: "Create Your Profile",
    description:
      "Enter your allergies, medical conditions, medications, and dietary preferences.",
  },
  {
    step: "2",
    title: "Add Ingredients You Have",
    description:
      "Share the ingredients you already have, plus any meal preferences for this specific suggestion.",
  },
  {
    step: "3",
    title: "Get a Personalized Dish Suggestion",
    description:
      "Receive an AI-suggested dish tailored to your profile, with substitutions and safety warnings when needed.",
  },
];

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-usf-green px-4 py-16 text-white sm:px-6 sm:py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            PersonalPlate
          </h1>
          <p className="mt-4 text-lg text-usf-gold sm:text-xl">
            Personalized recipe guidance for safer favorite meals
          </p>
          <p className="mx-auto mt-6 max-w-2xl text-base text-white/80">
            A personalized recipe assistant that helps each person enjoy meals
            they love with profile-aware suggestions, safer substitutions, and
            guidance based on available ingredients.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/login">
              <Button variant="gold" size="lg">
                Get Started
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <Alert variant="warning" title="Medical Disclaimer">
            {MEDICAL_DISCLAIMER}
          </Alert>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-bold text-dark-green sm:text-3xl">
            Features
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-neutral/70">
            Built for patients and care teams who need safer, smarter nutrition
            guidance.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <Card key={feature.title} className="text-center">
                <div className="mb-3 text-3xl" aria-hidden="true">
                  {feature.icon}
                </div>
                <h3 className="font-semibold text-dark-green">{feature.title}</h3>
                <p className="mt-2 text-sm text-neutral/70">
                  {feature.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-sand px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold text-dark-green sm:text-3xl">
            How It Works
          </h2>
          <div className="mt-10 space-y-6">
            {steps.map((item) => (
              <div
                key={item.step}
                className="flex gap-4 rounded-xl border border-light-border bg-white p-6"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-usf-green text-lg font-bold text-white">
                  {item.step}
                </div>
                <div>
                  <h3 className="font-semibold text-dark-green">{item.title}</h3>
                  <p className="mt-1 text-sm text-neutral/70">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-16 text-center sm:px-6">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-bold text-dark-green">
            Ready to get started?
          </h2>
          <p className="mt-2 text-neutral/70">
            Create a free account and set up your health profile in minutes.
          </p>
          <Link href="/login" className="mt-6 inline-block">
            <Button size="lg">Get Started</Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
