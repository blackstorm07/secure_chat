"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { errorMessage } from "@/services/api";
import { loginAccount } from "@/services/auth.service";
import { useAuthStore } from "@/store/auth.store";
import { loginSchema, type LoginValues } from "@/lib/validations";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const setSession = useAuthStore((state) => state.setSession);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(params.get("reason") === "expired" ? "Your session expired. Log in again." : null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const session = await loginAccount(values);
      setSession(session);
      router.replace("/chat");
    } catch (error) {
      setFormError(errorMessage(error));
    }
  });

  return (
    <form className="grid gap-4" onSubmit={onSubmit} noValidate>
      <div>
        <h1 className="text-2xl font-semibold">Log in</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Use the email and password for your account. Login by username is not available.</p>
      </div>
      {formError ? (
        <p role="alert" className="rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm">
          {formError}
        </p>
      ) : null}
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <input id="email" className="field" type="email" autoComplete="username" {...register("email")} />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password?.message}>
        <div className="relative">
          <input id="password" className="field pr-12" type={showPassword ? "text" : "password"} autoComplete="current-password" {...register("password")} />
          <button type="button" className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-2 text-[var(--muted)]" aria-pressed={showPassword} aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>
            {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </Field>
      <p className="text-xs text-[var(--muted)]">The session cookie stays on this browser until you log out or it expires. A separate remember-device option is not offered.</p>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Logging in" : "Log in"}
      </Button>
      <p className="text-sm text-[var(--muted)]">
        New here?{" "}
        <Link href="/register" className="text-[var(--text)] underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
