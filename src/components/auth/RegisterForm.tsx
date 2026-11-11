"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { passwordStrength, registerSchema, type RegisterValues } from "@/lib/validations";
import { errorMessage } from "@/services/api";
import { registerAccount } from "@/services/auth.service";
import { useAuthStore } from "@/store/auth.store";

export function RegisterForm() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", username: "", password: "", confirmPassword: "", acceptTerms: false },
  });
  const passwordField = register("password");
  const [passwordValue, setPasswordValue] = useState("");
  const strength = passwordStrength(passwordValue);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const session = await registerAccount({ username: values.username, email: values.email, password: values.password });
      setSession(session);
      router.replace("/chat");
    } catch (error) {
      setFormError(errorMessage(error));
    }
  });

  return (
    <form className="grid gap-4" onSubmit={onSubmit} noValidate>
      <div>
        <h1 className="text-2xl font-semibold">Create account</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">The account name is your username. A separate display name is not stored.</p>
      </div>
      {formError ? (
        <p role="alert" className="rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm">
          {formError}
        </p>
      ) : null}
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <input id="email" className="field" type="email" autoComplete="email" {...register("email")} />
      </Field>
      <Field label="Username" htmlFor="username" error={errors.username?.message} hint="3-32 letters, numbers, or underscores">
        <input id="username" className="field" autoComplete="username" {...register("username")} />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password?.message} hint="At least 12 characters with upper, lower, and a digit">
        <div className="relative">
          <input
            id="password"
            className="field pr-12"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            {...passwordField}
            onChange={(event) => {
              setPasswordValue(event.target.value);
              void passwordField.onChange(event);
            }}
          />
          <button type="button" className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-2 text-[var(--muted)]" aria-pressed={showPassword} aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <div className="mt-2" aria-live="polite">
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
            <div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${(strength.score / 5) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">Strength: {strength.label}</p>
        </div>
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
        <input id="confirmPassword" className="field" type={showPassword ? "text" : "password"} autoComplete="new-password" {...register("confirmPassword")} />
      </Field>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1 h-4 w-4" {...register("acceptTerms")} />
        <span>I understand SecureChat stores ciphertext and public keys. Message text is encrypted in this browser before it is sent, and the server cannot read it.</span>
      </label>
      {errors.acceptTerms ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {errors.acceptTerms.message}
        </p>
      ) : null}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating account" : "Create account"}
      </Button>
      <p className="text-sm text-[var(--muted)]">
        Already registered?{" "}
        <Link href="/login" className="text-[var(--text)] underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
