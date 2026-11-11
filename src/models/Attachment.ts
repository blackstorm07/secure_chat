import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const attachmentSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    objectKey: { type: String, required: true, unique: true, maxlength: 128 },
    encryptedSize: { type: Number, required: true, min: 1 },
    encryptedMimeType: { type: String, required: true, maxlength: 128 },
    status: { type: String, enum: ["pending", "ready"], default: "pending", required: true },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

attachmentSchema.index({ conversationId: 1, createdAt: -1 });
attachmentSchema.index({ uploadedBy: 1, status: 1 });
attachmentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AttachmentSchema = InferSchemaType<typeof attachmentSchema>;
export type AttachmentModelType = Model<AttachmentSchema>;
export const AttachmentModel = ((models.Attachment as AttachmentModelType | undefined) ??
  model("Attachment", attachmentSchema)) as AttachmentModelType;
