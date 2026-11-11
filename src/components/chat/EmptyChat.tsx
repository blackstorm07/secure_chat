import { Shield } from "lucide-react";

export function EmptyChat() {
  return (
    <section id="main" className="chat-wallpaper hidden min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center md:flex">
      <span className="grid h-16 w-16 place-items-center rounded-3xl bg-[var(--primary)] text-white shadow-[0_12px_30px_rgba(99,102,241,0.35)]">
        <Shield className="h-8 w-8" aria-hidden="true" />
      </span>
      <h1 className="text-xl font-semibold">SecureChat</h1>
      <p className="max-w-md text-sm text-[var(--muted)]">Select a conversation. Messages stay on the server as ciphertext until a Signal Protocol client can decrypt them.</p>
    </section>
  );
}
