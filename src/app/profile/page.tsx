"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { FormField, Input, Select, Textarea } from "@/components/FormField";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { computeBmi } from "@/lib/bmi";
import { parseCommaSeparated } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import { MEDICAL_DISCLAIMER } from "@/lib/types";

const emptyProfile: Profile = {
  full_name: "",
  age: null,
  gender: "",
  height_cm: null,
  weight_kg: null,
  medical_conditions: [],
  medications: [],
  allergies: [],
  dietary_restrictions: [],
  nutrition_goals: "",
  preferred_cuisine: "",
  activity_level: "",
  target_calories: null,
  budget_usd: null,
  preferred_foods: [],
  disliked_foods: [],
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [heightCm, setHeightCm] = useState<string>("");
  const [weightKg, setWeightKg] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const bmi = useMemo(
    () =>
      computeBmi(
        heightCm ? Number(heightCm) : null,
        weightKg ? Number(weightKg) : null
      ),
    [heightCm, weightKg]
  );

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (data) {
        const loaded = {
          ...emptyProfile,
          ...(data as Profile),
          preferred_foods: (data as Profile).preferred_foods ?? [],
          disliked_foods: (data as Profile).disliked_foods ?? [],
          activity_level: (data as Profile).activity_level ?? "",
          target_calories: (data as Profile).target_calories ?? null,
          budget_usd: (data as Profile).budget_usd ?? null,
        };
        setProfile(loaded);
        setHeightCm(loaded.height_cm != null ? String(loaded.height_cm) : "");
        setWeightKg(loaded.weight_kg != null ? String(loaded.weight_kg) : "");
      }
      setLoading(false);
    }

    loadProfile();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You must be signed in to save your profile.");
      setSaving(false);
      return;
    }

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    const profileData: Omit<Profile, "id" | "user_id" | "updated_at"> = {
      full_name: formData.get("full_name") as string,
      age: formData.get("age") ? Number(formData.get("age")) : null,
      gender: formData.get("gender") as string,
      height_cm: formData.get("height_cm")
        ? Number(formData.get("height_cm"))
        : null,
      weight_kg: formData.get("weight_kg")
        ? Number(formData.get("weight_kg"))
        : null,
      medical_conditions: parseCommaSeparated(
        formData.get("medical_conditions") as string
      ),
      medications: parseCommaSeparated(
        formData.get("medications") as string
      ),
      allergies: parseCommaSeparated(formData.get("allergies") as string),
      dietary_restrictions: parseCommaSeparated(
        formData.get("dietary_restrictions") as string
      ),
      nutrition_goals: formData.get("nutrition_goals") as string,
      preferred_cuisine: formData.get("preferred_cuisine") as string,
      activity_level: formData.get("activity_level") as string,
      target_calories: formData.get("target_calories")
        ? Number(formData.get("target_calories"))
        : null,
      budget_usd: formData.get("budget_usd")
        ? Number(formData.get("budget_usd"))
        : null,
      preferred_foods: parseCommaSeparated(
        formData.get("preferred_foods") as string
      ),
      disliked_foods: parseCommaSeparated(
        formData.get("disliked_foods") as string
      ),
    };

    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert(
        {
          user_id: user.id,
          ...profileData,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      setError(upsertError.message);
    } else {
      setSuccess(true);
      setProfile({ ...profileData });
      setHeightCm(
        profileData.height_cm != null ? String(profileData.height_cm) : ""
      );
      setWeightKg(
        profileData.weight_kg != null ? String(profileData.weight_kg) : ""
      );
    }

    setSaving(false);
  };

  if (loading) {
    return <LoadingSpinner message="Loading your profile..." />;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="mb-2 text-2xl font-bold text-dark-green sm:text-3xl">
        Health Profile
      </h1>
      <p className="mb-6 text-neutral/70">
        This information helps PersonalPlate provide safer, personalized
        recommendations.
      </p>

      <Alert variant="info" className="mb-6">
        {MEDICAL_DISCLAIMER}
      </Alert>

      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" className="mb-4">
          Profile saved successfully!
        </Alert>
      )}

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          <FormField label="Full Name" id="full_name">
            <Input
              id="full_name"
              name="full_name"
              defaultValue={profile.full_name}
              required
              placeholder="Jane Doe"
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Age" id="age">
              <Input
                id="age"
                name="age"
                type="number"
                min={1}
                max={120}
                defaultValue={profile.age ?? ""}
                placeholder="45"
              />
            </FormField>

            <FormField label="Gender" id="gender">
              <Select
                id="gender"
                name="gender"
                defaultValue={profile.gender}
              >
                <option value="">Select...</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="non-binary">Non-binary</option>
                <option value="prefer-not-to-say">Prefer not to say</option>
              </Select>
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Height (cm)" id="height_cm">
              <Input
                id="height_cm"
                name="height_cm"
                type="number"
                min={50}
                max={250}
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="170"
              />
            </FormField>

            <FormField label="Weight (kg)" id="weight_kg">
              <Input
                id="weight_kg"
                name="weight_kg"
                type="number"
                min={20}
                max={300}
                step="0.1"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="70"
              />
            </FormField>
          </div>

          <div className="rounded-lg border border-light-border bg-soft-bg px-3 py-2 text-sm text-neutral/80">
            <span className="font-medium text-dark-green">BMI: </span>
            {bmi.bmi != null ? `${bmi.bmi} (${bmi.label})` : bmi.label}
            <span className="ml-1 text-xs text-neutral/50">
              — calculated from height and weight, not stored
            </span>
          </div>

          <FormField label="Activity Level" id="activity_level">
            <Select
              id="activity_level"
              name="activity_level"
              defaultValue={profile.activity_level}
            >
              <option value="">Select...</option>
              <option value="sedentary">Sedentary</option>
              <option value="lightly_active">Lightly active</option>
              <option value="moderately_active">Moderately active</option>
              <option value="very_active">Very active</option>
              <option value="extra_active">Extra active</option>
            </Select>
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Target Calories (per meal)"
              id="target_calories"
              hint="Optional per-meal calorie target for recommendations"
            >
              <Input
                id="target_calories"
                name="target_calories"
                type="number"
                min={100}
                max={2000}
                defaultValue={profile.target_calories ?? ""}
                placeholder="450"
              />
            </FormField>

            <FormField
              label="Budget (USD per meal)"
              id="budget_usd"
              hint="Optional spending limit used when ranking recipes"
            >
              <Input
                id="budget_usd"
                name="budget_usd"
                type="number"
                min={0}
                step="0.01"
                defaultValue={profile.budget_usd ?? ""}
                placeholder="8.00"
              />
            </FormField>
          </div>

          <FormField
            label="Allergies"
            id="allergies"
            hint="Comma-separated, e.g. peanuts, shellfish, dairy"
          >
            <Input
              id="allergies"
              name="allergies"
              defaultValue={profile.allergies?.join(", ")}
              placeholder="peanuts, shellfish"
            />
          </FormField>

          <FormField
            label="Medical Conditions"
            id="medical_conditions"
            hint="Comma-separated, e.g. diabetes, hypertension"
          >
            <Input
              id="medical_conditions"
              name="medical_conditions"
              defaultValue={profile.medical_conditions?.join(", ")}
              placeholder="diabetes, hypertension"
            />
          </FormField>

          <FormField
            label="Medications"
            id="medications"
            hint="Comma-separated"
          >
            <Input
              id="medications"
              name="medications"
              defaultValue={profile.medications?.join(", ")}
              placeholder="metformin, lisinopril"
            />
          </FormField>

          <FormField
            label="Dietary Restrictions"
            id="dietary_restrictions"
            hint="Comma-separated, e.g. low-sodium, gluten-free"
          >
            <Input
              id="dietary_restrictions"
              name="dietary_restrictions"
              defaultValue={profile.dietary_restrictions?.join(", ")}
              placeholder="low-sodium, gluten-free"
            />
          </FormField>

          <FormField
            label="Preferred Foods"
            id="preferred_foods"
            hint="Comma-separated foods you enjoy"
          >
            <Input
              id="preferred_foods"
              name="preferred_foods"
              defaultValue={profile.preferred_foods?.join(", ")}
              placeholder="salmon, quinoa, leafy greens"
            />
          </FormField>

          <FormField
            label="Disliked Foods"
            id="disliked_foods"
            hint="Comma-separated foods to avoid when possible"
          >
            <Input
              id="disliked_foods"
              name="disliked_foods"
              defaultValue={profile.disliked_foods?.join(", ")}
              placeholder="cilantro, mushrooms"
            />
          </FormField>

          <FormField label="Nutrition Goals" id="nutrition_goals">
            <Textarea
              id="nutrition_goals"
              name="nutrition_goals"
              rows={3}
              defaultValue={profile.nutrition_goals}
              placeholder="Manage blood sugar, reduce sodium intake..."
            />
          </FormField>

          <FormField label="Preferred Cuisine" id="preferred_cuisine">
            <Input
              id="preferred_cuisine"
              name="preferred_cuisine"
              defaultValue={profile.preferred_cuisine}
              placeholder="Mediterranean, Asian, American..."
            />
          </FormField>

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "Saving..." : "Save Profile"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
