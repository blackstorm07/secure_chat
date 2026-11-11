import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    csrfToken: { type: String, required: true },
    authMethod: { type: String, enum: ["password", "passkey"], required: true },
    expiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, required: true },
    userAgent: { type: String, default: "", maxlength: 256 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

sessionSchema.index({ userId: 1, revokedAt: 1 });
sessionSchema.index({ absoluteExpiresAt: 1 }, { expireAfterSeconds: 0 });

export type SessionSchema = InferSchemaType<typeof sessionSchema>;
export type SessionModelType = Model<SessionSchema>;
export const SessionModel = ((models.Session as SessionModelType | undefined) ?? model("Session", sessionSchema)) as SessionModelType;
