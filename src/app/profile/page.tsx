"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { FormField, Input, Select, Textarea } from "@/components/FormField";
import { LoadingSpinner } from "@/components/LoadingSpinner";
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
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
        setProfile(data as Profile);
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

    const profileData = {
      full_name: formData.get("full_name") as string,
      age: formData.get("age")
        ? Number(formData.get("age"))
        : null,
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
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert({ user_id: user.id, ...profileData }, { onConflict: "user_id" });

    if (upsertError) {
      setError(upsertError.message);
    } else {
      setSuccess(true);
      setProfile({ ...profileData });
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
                defaultValue={profile.height_cm ?? ""}
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
                defaultValue={profile.weight_kg ?? ""}
                placeholder="70"
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
