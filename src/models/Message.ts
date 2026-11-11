import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    senderUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    senderDeviceId: { type: Schema.Types.ObjectId, ref: "Device", required: true },
    recipientDeviceId: { type: Schema.Types.ObjectId, ref: "Device", required: true },
    ciphertext: { type: String, required: true, maxlength: 65_536 },
    messageType: { type: String, enum: ["prekey", "message", "receipt"], required: true },
    protocolVersion: { type: String, required: true, maxlength: 32 },
    clientMessageId: { type: String, required: true, maxlength: 64 },
    expiresAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

messageSchema.index({ conversationId: 1, recipientDeviceId: 1, _id: -1 });
messageSchema.index({ conversationId: 1, senderDeviceId: 1, _id: -1 });
messageSchema.index({ senderDeviceId: 1, recipientDeviceId: 1, clientMessageId: 1 }, { unique: true });
messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type MessageSchema = InferSchemaType<typeof messageSchema>;
export type MessageModelType = Model<MessageSchema>;
export const MessageModel = ((models.Message as MessageModelType | undefined) ?? model("Message", messageSchema)) as MessageModelType;
