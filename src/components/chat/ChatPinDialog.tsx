"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { errorMessage } from "@/services/api";
import { verifyChatPin } from "@/services/auth.service";
import { useAuthStore } from "@/store/auth.store";

export function ChatPinDialog({ onClose, onUnlocked }: { onClose: () => void; onUnlocked: () => void }) {
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const pinSet = useAuthStore((state) => state.user?.chatPinSet ?? false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <Modal title={pinSet ? "Enter chat PIN" : "Set a chat PIN"} onClose={onClose}>
      {pinSet ? (
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!csrfToken || pin.length !== 4) return;
            setPending(true);
            setError(null);
            void verifyChatPin(csrfToken, pin)
              .then(() => onUnlocked())
              .catch((caught: unknown) => setError(errorMessage(caught)))
              .finally(() => setPending(false));
          }}
        >
          <p className="text-sm text-[var(--muted)]">Enter the 4-digit PIN to read this chat.</p>
          <Field label="PIN" htmlFor="chat-pin" error={error ?? undefined}>
            <input
              id="chat-pin"
              className="field tracking-[0.4em]"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </Field>
          <Button type="submit" disabled={pending || pin.length !== 4}>
            {pending ? "Checking" : "Unlock chat"}
          </Button>
        </form>
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-[var(--muted)]">Set a 4-digit PIN in Settings before opening a chat.</p>
          <Link href="/settings" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--primary)] px-4 text-sm font-medium text-white" onClick={onClose}>
            Open settings
          </Link>
        </div>
      )}
    </Modal>
  );
}
