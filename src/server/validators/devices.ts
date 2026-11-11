import { z } from "zod";
import { objectIdSchema } from "@/server/validators/auth";

const keyMaterial = z.string().min(16).max(512);

export const registerDeviceSchema = z.strictObject({
  deviceName: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine((value) => !/[\u0000-\u001F\u007F]/.test(value), "Device name contains unsupported characters"),
  identityPublicKey: keyMaterial,
  registrationId: z.number().int().min(1).max(16_777_215),
});

export const uploadKeysSchema = z
  .strictObject({
    deviceId: objectIdSchema,
    signedPreKeyId: z.number().int().min(1).max(16_777_215),
    signedPreKeyPublic: keyMaterial,
    signedPreKeySignature: keyMaterial,
    oneTimePreKeys: z
      .array(
        z.strictObject({
          keyId: z.number().int().min(1).max(16_777_215),
          publicKey: keyMaterial,
        }),
      )
      .max(100),
  })
  .superRefine((value, context) => {
    const ids = value.oneTimePreKeys.map((item) => item.keyId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", path: ["oneTimePreKeys"], message: "One-time prekey ids must be unique" });
    }
  });

export const consumeKeySchema = z.strictObject({
  userId: objectIdSchema,
  deviceId: objectIdSchema,
  keyId: z.number().int().min(1).max(16_777_215).optional(),
});
