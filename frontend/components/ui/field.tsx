import { useId } from "react";
import { cn } from "@/lib/utils";
import { Eyebrow } from "./panel";

interface FieldProps {
  label: string;
  hint?: string;
  children: (id: string) => React.ReactNode;
  className?: string;
}

/**
 * Label/control pairing. The render-prop hands the generated id to the control
 * so every input is properly labelled without callers inventing ids (PRD 15.4).
 */
export function Field({ label, hint, children, className }: FieldProps) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id}>
        <Eyebrow>{label}</Eyebrow>
      </label>
      {children(id)}
      {hint && <p className="text-[11px] leading-snug text-ink-muted">{hint}</p>}
    </div>
  );
}

const controlStyles =
  "min-h-10 w-full rounded-md border border-line bg-bg px-3 text-[13px] text-ink " +
  "transition-colors duration-150 hover:border-line-strong " +
  "disabled:cursor-not-allowed disabled:text-ink-muted";

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(controlStyles, "appearance-none pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlStyles, className)} {...props} />;
}
