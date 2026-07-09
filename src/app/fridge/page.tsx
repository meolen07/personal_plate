import { requireUser } from "@/lib/auth";
import { Alert } from "@/components/Alert";
import { VirtualFridge } from "@/components/VirtualFridge";
import { MEDICAL_DISCLAIMER } from "@/lib/types";

export default async function FridgePage() {
  await requireUser();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-2 text-2xl font-bold text-dark-green sm:text-3xl">
        Virtual Fridge
      </h1>
      <p className="mb-6 text-neutral/70">
        Keep your available ingredients here. Your fridge is managed separately
        from your health profile, while your profile remains focused on
        personalization.
      </p>

      <Alert variant="info" className="mb-6">
        {MEDICAL_DISCLAIMER}
      </Alert>

      <VirtualFridge />
    </div>
  );
}
