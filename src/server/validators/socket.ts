import { z } from "zod";

export const socketMessageSchema = z.strictObject({
  conversationId: z.string(),
  senderDeviceId: z.string(),
  clientMessageId: z.string(),
  messageType: z.string(),
  protocolVersion: z.string(),
  expiresAt: z.string().optional(),
  envelopes: z.array(z.strictObject({ recipientDeviceId: z.string(), ciphertext: z.string() })).max(20),
});

export const socketReceiptSchema = z.strictObject({
  messageId: z.string().regex(/^[a-f\d]{24}$/i),
});

export const socketTypingSchema = z.strictObject({
  conversationId: z.string().regex(/^[a-f\d]{24}$/i),
});

const callIdSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const callKindSchema = z.enum(["invite", "cancel", "accept", "decline", "hangup", "offer", "answer", "ice"]);

export const callSignalSchema = z
  .strictObject({
    conversationId: z.string().regex(/^[a-f\d]{24}$/i),
    callId: callIdSchema,
    kind: callKindSchema,
    media: z.enum(["audio", "video"]).optional(),
    sdp: z.string().min(1).max(32_000).optional(),
    candidate: z.string().min(1).max(4_000).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.kind === "invite" && !value.media) {
      context.addIssue({ code: "custom", path: ["media"], message: "Invite requires media" });
    }
    if ((value.kind === "offer" || value.kind === "answer") && !value.sdp) {
      context.addIssue({ code: "custom", path: ["sdp"], message: "Description required" });
    }
    if (value.kind === "ice" && value.candidate === undefined) {
      context.addIssue({ code: "custom", path: ["candidate"], message: "Candidate required" });
    }
  });

export const realtimeEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("message:receive"),
    targetDeviceId: z.string(),
    payload: z.strictObject({ id: z.string(), ciphertext: z.string(), conversationId: z.string() }),
  }),
  z.strictObject({
    type: z.literal("message:delivered"),
    targetDeviceId: z.string(),
    payload: z.strictObject({ messageId: z.string(), deliveredAt: z.string() }),
  }),
  z.strictObject({
    type: z.literal("message:read"),
    targetDeviceId: z.string(),
    payload: z.strictObject({ messageId: z.string(), readAt: z.string(), deliveredAt: z.string() }),
  }),
  z.strictObject({
    type: z.literal("device:revoked"),
    targetDeviceId: z.string(),
  }),
  z.strictObject({
    type: z.literal("typing"),
    conversationId: z.string(),
    userId: z.string(),
    state: z.enum(["start", "stop"]),
  }),
  z.strictObject({
    type: z.literal("presence"),
    userId: z.string(),
    status: z.enum(["online", "offline"]),
    conversationIds: z.array(z.string()),
  }),
  z.strictObject({
    type: z.literal("membership:joined"),
    userId: z.string(),
    conversationId: z.string(),
  }),
  z.strictObject({
    type: z.literal("call"),
    targetUserId: z.string(),
    payload: z.strictObject({
      conversationId: z.string(),
      callId: z.string(),
      kind: callKindSchema,
      fromUserId: z.string(),
      media: z.enum(["audio", "video"]).optional(),
      sdp: z.string().max(32_000).optional(),
      candidate: z.string().max(4_000).nullable().optional(),
    }),
  }),
]);
