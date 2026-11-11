"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { errorMessage } from "@/services/api";
import { saveChatPin } from "@/services/auth.service";
import { useAuthStore } from "@/store/auth.store";

export function ChatPinSettings() {
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const pinSet = user?.chatPinSet ?? false;
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  function digits(value: string): string {
    return value.replace(/\D/g, "").slice(0, 4);
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!csrfToken || !user) return;
        if (pin !== confirm) {
          setError("The PIN and confirmation do not match");
          return;
        }
        setPending(true);
        setError(null);
        setSaved(false);
        void saveChatPin(csrfToken, pin, pinSet ? currentPin : undefined)
          .then((result) => {
            if (!result.user.chatPinSet) throw new Error("Chat PIN could not be saved");
            setSession({ user: result.user, csrfToken });
            setCurrentPin("");
            setPin("");
            setConfirm("");
            setSaved(true);
          })
          .catch((caught: unknown) => {
            const message = errorMessage(caught);
            if (message === "Enter the current PIN" && user) setSession({ user: { ...user, chatPinSet: true }, csrfToken });
            setError(message);
          })
          .finally(() => setPending(false));
      }}
    >
      <div>
        <h3 className="text-sm font-semibold">Chat PIN</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {pinSet ? "A 4-digit PIN is required before a chat can be read." : "Choose a 4-digit PIN. Both devices use the same PIN."}
        </p>
      </div>
      {pinSet ? (
        <Field label="Current PIN" htmlFor="current-chat-pin">
          <input id="current-chat-pin" className="field tracking-[0.4em]" inputMode="numeric" autoComplete="off" maxLength={4} value={currentPin} onChange={(event) => setCurrentPin(digits(event.target.value))} />
        </Field>
      ) : null}
      <Field label={pinSet ? "New PIN" : "PIN"} htmlFor="new-chat-pin">
        <input id="new-chat-pin" className="field tracking-[0.4em]" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={(event) => setPin(digits(event.target.value))} />
      </Field>
      <Field label="Confirm PIN" htmlFor="confirm-chat-pin" error={error ?? undefined}>
        <input id="confirm-chat-pin" className="field tracking-[0.4em]" inputMode="numeric" autoComplete="off" maxLength={4} value={confirm} onChange={(event) => setConfirm(digits(event.target.value))} />
      </Field>
      {saved ? <p className="text-sm text-[var(--online)]">Chat PIN saved.</p> : null}
      <Button type="submit" disabled={pending || pin.length !== 4 || confirm.length !== 4 || (pinSet && currentPin.length !== 4)}>
        {pending ? "Saving" : pinSet ? "Change PIN" : "Save PIN"}
      </Button>
    </form>
  );
}
