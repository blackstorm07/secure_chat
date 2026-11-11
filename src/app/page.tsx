import type { Metadata } from "next";
import Link from "next/link";
import { HomeActions } from "@/components/layout/HomeActions";

export const metadata: Metadata = {
  title: "SecureChat",
};

export default function HomePage() {
  return (
    <main id="main" className="mx-auto grid min-h-dvh max-w-3xl content-center gap-6 px-6 py-16">
      <p className="text-sm font-medium tracking-wide text-[var(--primary)] uppercase">SecureChat</p>
      <h1 className="text-4xl font-semibold tracking-tight">Private messages, without pretending.</h1>
      <p className="max-w-2xl text-lg text-[var(--muted)]">
        The server stores public keys and opaque ciphertext. Message text is encrypted in this browser with the Signal protocol before it is sent. Media is encrypted in the browser before it reaches private storage.
      </p>
      <HomeActions />
      <p className="text-sm text-[var(--muted)]">
        <Link href="/login" className="underline">
          Log in
        </Link>{" "}
        or{" "}
        <Link href="/register" className="underline">
          create an account
        </Link>
        .
      </p>
    </main>
  );
}
