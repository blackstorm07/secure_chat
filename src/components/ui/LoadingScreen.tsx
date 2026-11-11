import { LoaderCircle } from "lucide-react";

export function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6" role="status">
      <div className="flex items-center gap-3 text-[var(--muted)]">
        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
        <span>{label}</span>
      </div>
    </div>
  );
}
