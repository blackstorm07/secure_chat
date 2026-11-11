import type { ReactNode } from "react";

export function UnavailableNote({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]">{children}</p>;
}
