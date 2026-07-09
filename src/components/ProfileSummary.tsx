import Link from "next/link";
import { Card } from "./Card";
import { Button } from "./Button";
import { formatArray } from "@/lib/utils";
import type { Profile } from "@/lib/types";

interface ProfileSummaryProps {
  profile: Profile | null;
}

export function ProfileSummary({ profile }: ProfileSummaryProps) {
  if (!profile || !profile.full_name) {
    return (
      <Card title="Health Profile" subtitle="Complete your profile for personalized recommendations">
        <p className="mb-4 text-sm text-neutral/70">
          No health profile found. Add your allergies, conditions, and dietary
          preferences to get safer meal recommendations.
        </p>
        <Link href="/profile">
          <Button size="sm">Set Up Profile</Button>
        </Link>
      </Card>
    );
  }

  return (
    <Card title="Health Profile" subtitle={profile.full_name}>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-dark-green">Allergies</dt>
          <dd className="text-neutral/80">{formatArray(profile.allergies)}</dd>
        </div>
        <div>
          <dt className="font-medium text-dark-green">Medical Conditions</dt>
          <dd className="text-neutral/80">
            {formatArray(profile.medical_conditions)}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-dark-green">Dietary Restrictions</dt>
          <dd className="text-neutral/80">
            {formatArray(profile.dietary_restrictions)}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-dark-green">Nutrition Goals</dt>
          <dd className="text-neutral/80">
            {profile.nutrition_goals || "Not specified"}
          </dd>
        </div>
      </dl>
      <div className="mt-4">
        <Link href="/profile">
          <Button variant="secondary" size="sm">
            Edit Profile
          </Button>
        </Link>
      </div>
    </Card>
  );
}
