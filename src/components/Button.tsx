import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "gold" | "danger";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

const variants = {
  primary: "bg-usf-green text-white hover:bg-dark-green focus:ring-usf-green",
  secondary: "bg-neutral text-white hover:bg-neutral/90 focus:ring-neutral",
  outline:
    "border-2 border-white/60 bg-transparent text-white hover:bg-white/10 focus:ring-white",
  gold: "bg-usf-gold text-dark-green hover:bg-usf-gold/90 focus:ring-usf-gold",
  danger: "bg-danger-text text-white hover:bg-danger-text/90 focus:ring-danger-text",
};

const sizes = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
