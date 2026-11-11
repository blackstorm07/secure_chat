"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { profileSchema, type ProfileValues } from "@/lib/validations";
import { errorMessage } from "@/services/api";
import { updateProfile } from "@/services/auth.service";
import { useAuthStore } from "@/store/auth.store";
import { copyText, shortId } from "@/lib/utils";

export function ProfileSettings() {
  const user = useAuthStore((state) => state.user);
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const setSession = useAuthStore((state) => state.setSession);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: { username: user?.username ?? "", profileImage: user?.profileImage ?? "" },
  });

  if (!user || !csrfToken) return null;

  return (
    <form
      className="grid gap-4"
      onSubmit={form.handleSubmit(async (values) => {
        setMessage(null);
        try {
          const result = await updateProfile(csrfToken, {
            username: values.username,
            profileImage: values.profileImage === "" ? null : values.profileImage,
          });
          setSession({ user: result.user, csrfToken });
          setMessage("Profile saved.");
        } catch (error) {
          setMessage(errorMessage(error));
        }
      })}
    >
      <Field label="Username" htmlFor="profile-username" error={form.formState.errors.username?.message}>
        <input id="profile-username" className="field" {...form.register("username")} />
      </Field>
      <Field label="Profile image" htmlFor="profile-image" error={form.formState.errors.profileImage?.message} hint="An https URL. File upload for avatars is not available.">
        <input id="profile-image" className="field" placeholder="https://" {...form.register("profileImage")} />
      </Field>
      <p className="text-sm text-[var(--muted)]">Email: {user.email}</p>
      <p className="text-sm text-[var(--muted)]">User id: {shortId(user.id)}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving" : "Save profile"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            void copyText(user.id).then((ok) => setCopied(ok));
          }}
        >
          {copied ? "Copied" : "Copy user id"}
        </Button>
      </div>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
