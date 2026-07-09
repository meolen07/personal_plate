import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface AlertProps {
  variant?: "info" | "warning" | "danger" | "success";
  title?: string;
  children: ReactNode;
  className?: string;
}

const variants = {
  info: "border-light-border bg-soft-bg text-neutral",
  warning: "border-warning-text/30 bg-warning-bg text-warning-text",
  danger: "border-danger-text/30 bg-danger-bg text-danger-text",
  success: "border-success-text/30 bg-success-bg text-success-text",
};

export function Alert({
  variant = "info",
  title,
  children,
  className,
}: AlertProps) {
  return (
    <div
      role="alert"
      className={cn("rounded-lg border p-4", variants[variant], className)}
    >
      {title && <p className="mb-1 font-semibold">{title}</p>}
      <div className="text-sm">{children}</div>
    </div>
  );
}
