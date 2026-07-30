"use client";

import { Alert } from "@/components/Alert";
import { PersonalizedRankPanel } from "@/components/PersonalizedRankPanel";
import { MEDICAL_DISCLAIMER } from "@/lib/types";

export default function RecommendPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="mb-2 text-2xl font-bold text-dark-green sm:text-3xl">
        Get Meal Suggestions
      </h1>

      <Alert variant="info" className="mb-6">
        {MEDICAL_DISCLAIMER}
      </Alert>

      <PersonalizedRankPanel />
    </div>
  );
}
