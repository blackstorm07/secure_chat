import { z } from "zod";

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");

export const registerSchema = z.strictObject({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,32}$/, "Username must be 3-32 characters and use letters, numbers, or underscores"),
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(128)
    .regex(/[a-z]/, "Password must include a lowercase letter")
    .regex(/[A-Z]/, "Password must include an uppercase letter")
    .regex(/[0-9]/, "Password must include a digit"),
});

export const realtimeTicketSchema = z.strictObject({
  deviceId: objectIdSchema,
});

export const loginSchema = z.strictObject({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

export const profileSchema = z
  .strictObject({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_]{3,32}$/, "Username must be 3-32 characters and use letters, numbers, or underscores")
      .optional(),
    profileImage: z
      .url()
      .max(2048)
      .refine((value) => value.startsWith("https://"), "Profile image must use https")
      .nullable()
      .optional(),
  })
  .refine((value) => value.username !== undefined || value.profileImage !== undefined, {
    message: "At least one profile field is required",
  });

export const deactivateSchema = z.strictObject({
  password: z.string().min(1).max(128),
});

const fourDigitPin = z.string().regex(/^\d{4}$/, "PIN must be 4 digits");

export const chatPinSchema = z.strictObject({
  pin: fourDigitPin,
  currentPin: fourDigitPin.optional(),
});

export const verifyChatPinSchema = z.strictObject({
  pin: fourDigitPin,
});
