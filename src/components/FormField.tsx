import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

interface FormFieldProps {
  label: string;
  id: string;
  hint?: string;
  error?: string;
  children?: ReactNode;
}

export function FormField({ label, id, hint, error, children }: FormFieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-dark-green">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-neutral/60">{hint}</p>
      )}
      {error && <p className="text-xs text-danger-text">{error}</p>}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
}

export function Input({ className, id, ...props }: InputProps) {
  return (
    <input
      id={id}
      className={cn(
        "w-full rounded-lg border border-light-border bg-white px-3 py-2 text-sm text-neutral placeholder:text-neutral/40 focus:border-usf-green focus:outline-none focus:ring-2 focus:ring-usf-green/20",
        className
      )}
      {...props}
    />
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  id: string;
}

export function Textarea({ className, id, ...props }: TextareaProps) {
  return (
    <textarea
      id={id}
      className={cn(
        "w-full rounded-lg border border-light-border bg-white px-3 py-2 text-sm text-neutral placeholder:text-neutral/40 focus:border-usf-green focus:outline-none focus:ring-2 focus:ring-usf-green/20",
        className
      )}
      {...props}
    />
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  id: string;
}

export function Select({ className, id, children, ...props }: SelectProps) {
  return (
    <select
      id={id}
      className={cn(
        "w-full rounded-lg border border-light-border bg-white px-3 py-2 text-sm text-neutral focus:border-usf-green focus:outline-none focus:ring-2 focus:ring-usf-green/20",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
