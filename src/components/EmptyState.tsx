import type { ReactNode } from "react";
import { Button } from "./Button";

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  icon?: ReactNode;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-light-border bg-white px-6 py-12 text-center">
      {icon && <div className="mb-4 text-4xl text-usf-green/40">{icon}</div>}
      <h3 className="text-lg font-semibold text-dark-green">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-neutral/70">{description}</p>
      {actionLabel && onAction && (
        <Button className="mt-6" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
