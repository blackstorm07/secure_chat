"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { SecuritySettings } from "@/components/settings/SecuritySettings";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { UnavailableNote } from "@/components/ui/UnavailableNote";
import { deactivateSchema, type DeactivateValues } from "@/lib/validations";
import { errorMessage } from "@/services/api";
import { deactivateAccount } from "@/services/auth.service";
import { useAuthStore } from "@/store/auth.store";
import { useThemeStore, type ThemeName } from "@/store/theme.store";

export function SettingsPanel() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const logout = useAuthStore((state) => state.logout);
  const clear = useAuthStore((state) => state.clear);
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);
  const deactivateForm = useForm<DeactivateValues>({ resolver: zodResolver(deactivateSchema), defaultValues: { password: "" } });

  return (
    <main id="main" className="min-h-0 flex-1 overflow-y-auto bg-[var(--chat)] px-4 py-6 sm:px-8">
      <div className="mx-auto grid max-w-2xl gap-8">
        <header>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Controls that the server does not support are marked unavailable.</p>
        </header>
        <Section title="Profile">
          <ProfileSettings />
          <UnavailableNote>An about or status message is not stored.</UnavailableNote>
        </Section>
        <Section title="Account">
          <p className="text-sm">Email: {user?.email}</p>
          <UnavailableNote>Changing the password or email is not available.</UnavailableNote>
          {logoutError ? (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {logoutError}
            </p>
          ) : null}
          <Button
            variant="ghost"
            onClick={() => {
              setLogoutError(null);
              void logout()
                .then(() => router.replace("/login"))
                .catch((error: unknown) => setLogoutError(errorMessage(error)));
            }}
          >
            Log out
          </Button>
          <form
            className="grid gap-3 rounded-2xl border border-[var(--border)] p-4"
            onSubmit={deactivateForm.handleSubmit(async (values) => {
              if (!csrfToken) return;
              if (!window.confirm("Deactivate this account? You will not be able to log in again.")) return;
              setDeactivateError(null);
              try {
                await deactivateAccount(csrfToken, values.password);
                clear();
                router.replace("/login");
              } catch (error) {
                setDeactivateError(errorMessage(error));
              }
            })}
          >
            <h3 className="font-medium">Deactivate account</h3>
            <Field label="Current password" htmlFor="deactivate-password" error={deactivateForm.formState.errors.password?.message}>
              <input id="deactivate-password" className="field" type="password" autoComplete="current-password" {...deactivateForm.register("password")} />
            </Field>
            {deactivateError ? (
              <p role="alert" className="text-sm text-[var(--danger)]">
                {deactivateError}
              </p>
            ) : null}
            <Button type="submit" variant="danger" disabled={deactivateForm.formState.isSubmitting}>
              Deactivate account
            </Button>
          </form>
        </Section>
        <Section title="Privacy">
          <UnavailableNote>Opening a conversation sends read receipts. There is no switch to hide them.</UnavailableNote>
          <UnavailableNote>Online status is sent while this browser is connected. There is no visibility switch.</UnavailableNote>
          <UnavailableNote>Blocked users are not available.</UnavailableNote>
        </Section>
        <Section title="Security" id="security">
          <SecuritySettings />
        </Section>
        <Section title="Appearance">
          <div className="flex gap-2" role="group" aria-label="Theme">
            <ThemeButton current={theme} value="dark" onSelect={setTheme} />
            <ThemeButton current={theme} value="light" onSelect={setTheme} />
          </div>
          <p className="text-xs text-[var(--muted)]">The choice is saved in this browser. It is not an account setting.</p>
        </Section>
      </div>
    </main>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="grid scroll-mt-6 gap-3 rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ThemeButton({ current, value, onSelect }: { current: ThemeName; value: ThemeName; onSelect: (theme: ThemeName) => void }) {
  const selected = current === value;
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={selected ? "rounded-xl bg-[var(--primary)] px-4 py-2 text-sm text-white" : "rounded-xl border border-[var(--border)] px-4 py-2 text-sm"}
      onClick={() => onSelect(value)}
    >
      {value === "dark" ? "Dark" : "Light"}
    </button>
  );
}
