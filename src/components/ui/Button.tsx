import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "danger" | "secondary";

export function Button({
  variant = "primary",
  className,
  type = "button",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-[var(--primary)] text-white",
        variant === "secondary" && "bg-[var(--secondary)] text-white",
        variant === "ghost" && "bg-transparent text-[var(--text)] hover:bg-[var(--hover)] hover:brightness-100",
        variant === "danger" && "bg-red-600 text-white",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
