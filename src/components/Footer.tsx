import { MEDICAL_DISCLAIMER } from "@/lib/types";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-light-border bg-sand">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-4 rounded-lg border border-usf-gold/40 bg-white p-4">
          <p className="text-sm font-medium text-dark-green">Medical Disclaimer</p>
          <p className="mt-1 text-sm text-neutral/80">{MEDICAL_DISCLAIMER}</p>
        </div>
        <p className="text-center text-xs text-neutral/60">
          &copy; {new Date().getFullYear()} PersonalPlate. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
