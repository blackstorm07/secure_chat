import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_CIPHERTEXT_CHARS, MAX_ENVELOPES_PER_MESSAGE, MAX_MEDIA_BYTES, MAX_PAGE_SIZE, ENCRYPTED_MEDIA_MIME_TYPE } from "@/server/config/constants";
import { objectIdSchema } from "@/server/validators/auth";

export const createConversationSchema = z.strictObject({
  conversationType: z.literal("direct"),
  participantUserId: objectIdSchema,
});

const envelopeSchema = z.strictObject({
  recipientDeviceId: objectIdSchema,
  ciphertext: z.string().min(16).max(MAX_CIPHERTEXT_CHARS),
});

export const createMessageSchema = z
  .strictObject({
    conversationId: objectIdSchema,
    senderDeviceId: objectIdSchema,
    clientMessageId: z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
    messageType: z.enum(["prekey", "message", "receipt"]),
    protocolVersion: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9._-]+$/),
    expiresAt: z.iso.datetime().optional(),
    envelopes: z.array(envelopeSchema).min(1).max(MAX_ENVELOPES_PER_MESSAGE),
  })
  .refine((value) => new Set(value.envelopes.map((item) => item.recipientDeviceId)).size === value.envelopes.length, {
    message: "Recipient devices must be unique",
  });

export const messagePageSchema = z.strictObject({
  cursor: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const uploadUrlSchema = z.strictObject({
  conversationId: objectIdSchema,
  attachmentId: objectIdSchema.optional(),
  encryptedSize: z.number().int().min(1).max(MAX_MEDIA_BYTES),
  encryptedMimeType: z.literal(ENCRYPTED_MEDIA_MIME_TYPE),
});

export const attachmentIdSchema = z.strictObject({
  attachmentId: objectIdSchema,
});
