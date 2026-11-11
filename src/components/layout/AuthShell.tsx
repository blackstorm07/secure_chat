"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";

export function AuthShell({ children }: { children: ReactNode }) {
  const { status, error, retry } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.replace("/chat");
  }, [router, status]);

  if (status === "unknown") return <LoadingScreen label="Checking session" />;
  if (status === "authenticated") return <LoadingScreen label="Opening chats" />;
  if (status === "error") {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div className="grid max-w-sm gap-4">
          <p role="alert">{error ?? "The session could not be checked."}</p>
          <Button onClick={() => void retry()}>Try again</Button>
        </div>
      </div>
    );
  }

  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-6 shadow-[var(--shadow)] sm:p-8">
        <Link href="/" className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--primary)] text-lg font-semibold text-white">S</span>
          <span>
            <span className="block text-lg font-semibold">SecureChat</span>
            <span className="block text-sm text-[var(--muted)]">Private messaging</span>
          </span>
        </Link>
        {children}
      </div>
    </main>
  );
}
