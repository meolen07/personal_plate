import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
}

export function Card({ children, className, title, subtitle }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-light-border bg-white p-6 shadow-sm",
        className
      )}
    >
      {title && (
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-dark-green">{title}</h2>
          {subtitle && (
            <p className="mt-1 text-sm text-neutral/70">{subtitle}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
