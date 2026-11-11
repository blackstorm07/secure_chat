import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .max(254, "Email is too long")
  .refine((value) => z.email().safeParse(value).success, "Enter a valid email address");

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,32}$/, "Use 3-32 letters, numbers, or underscores");

export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(128, "Use at most 128 characters")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a digit");

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(128, "Password is too long"),
});

export const registerSchema = z
  .strictObject({
    email: emailSchema,
    username: usernameSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password").max(128),
    acceptTerms: z.boolean().refine((value) => value, "Accept the account terms to continue"),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export const profileSchema = z.strictObject({
  username: usernameSchema,
  profileImage: z.union([
    z.literal(""),
    z
      .string()
      .trim()
      .refine((value) => {
        try {
          return new URL(value).protocol === "https:";
        } catch {
          return false;
        }
      }, "Profile image must be an https URL"),
  ]),
});

export const participantSchema = z.strictObject({
  participantUserId: z.string().trim().regex(/^[a-f\d]{24}$/i, "Enter the 24-character user id"),
});

export const deactivateSchema = z.strictObject({
  password: z.string().min(1, "Enter your password").max(128),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type ProfileValues = z.infer<typeof profileSchema>;
export type ParticipantValues = z.infer<typeof participantSchema>;
export type DeactivateValues = z.infer<typeof deactivateSchema>;

export function passwordStrength(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong", "Strong"];
  return { score, label: labels[score] ?? "Too short" };
}

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const EXTENSION_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  pdf: "application/pdf",
  txt: "text/plain",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const MAX_PLAINTEXT_MEDIA_BYTES = 25 * 1024 * 1024 - 64 * 1024;

export function attachmentMime(file: File): string | null {
  if (file.type && ALLOWED_MIME_TYPES.has(file.type)) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const fallback = EXTENSION_MIME[extension];
  if (!fallback) return null;
  if (file.type && file.type !== fallback) return null;
  return fallback;
}

export function validateAttachment(file: File): string | null {
  if (file.size < 1) return "Choose a non-empty file";
  if (file.size > MAX_PLAINTEXT_MEDIA_BYTES) return "Files must be 24 MB or smaller so the encrypted upload stays within 25 MB";
  if (!attachmentMime(file)) return "This file type is not supported";
  return null;
}
