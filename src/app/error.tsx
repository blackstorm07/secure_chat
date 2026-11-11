"use client";

import { Button } from "@/components/ui/Button";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="grid max-w-sm gap-4">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-[var(--muted)]">The page could not be displayed.</p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
