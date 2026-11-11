"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

export function HomeActions() {
  const { status } = useAuth();
  if (status === "authenticated") {
    return (
      <Link href="/chat" className="inline-flex min-h-11 w-fit items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-medium text-white">
        Open chats
      </Link>
    );
  }
  return (
    <div className="flex flex-wrap gap-3">
      <Link href="/login" className="inline-flex min-h-11 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-medium text-white">
        Log in
      </Link>
      <Link href="/register" className="inline-flex min-h-11 items-center rounded-xl border border-[var(--border)] px-4 text-sm font-medium">
        Create account
      </Link>
    </div>
  );
}
