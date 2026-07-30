"use client";

import { Suspense, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/Alert";
import { AiSuggestPanel } from "@/components/AiSuggestPanel";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { PersonalizedRankPanel } from "@/components/PersonalizedRankPanel";
import { MEDICAL_DISCLAIMER } from "@/lib/types";

export type RecommendTab = "suggest" | "ranked";

function parseTab(value: string | null): RecommendTab {
  return value === "ranked" || value === "discover" ? "ranked" : "suggest";
}

function RecommendTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const selectTab = useCallback(
    (next: RecommendTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "suggest") {
        params.delete("tab");
      } else {
        params.set("tab", "ranked");
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams]
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="mb-2 text-2xl font-bold text-dark-green sm:text-3xl">
        Get Meal Suggestions
      </h1>

      <Alert variant="info" className="mb-6">
        {MEDICAL_DISCLAIMER}
      </Alert>

      <div
        className="mb-6 flex gap-2 rounded-lg border border-light-border bg-soft-bg p-1"
        role="tablist"
        aria-label="Recommendation mode"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "suggest"}
          onClick={() => selectTab("suggest")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === "suggest"
              ? "bg-white text-dark-green shadow-sm"
              : "text-neutral/70 hover:text-dark-green"
          }`}
        >
          AI Suggest
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "ranked"}
          onClick={() => selectTab("ranked")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === "ranked"
              ? "bg-white text-dark-green shadow-sm"
              : "text-neutral/70 hover:text-dark-green"
          }`}
        >
          Personalized Rank
        </button>
      </div>

      {tab === "suggest" ? <AiSuggestPanel /> : <PersonalizedRankPanel />}
    </div>
  );
}

export default function RecommendPage() {
  return (
    <Suspense fallback={<LoadingSpinner message="Loading recommendations..." />}>
      <RecommendTabs />
    </Suspense>
  );
}
