import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const oneTimePreKeySchema = new Schema(
  {
    keyId: { type: Number, required: true, min: 1 },
    publicKey: { type: String, required: true, maxlength: 512 },
    consumedAt: { type: Date, default: null },
  },
  { _id: false },
);

const preKeySchema = new Schema(
  {
    deviceId: { type: Schema.Types.ObjectId, ref: "Device", required: true, unique: true },
    signedPreKeyId: { type: Number, required: true, min: 1 },
    signedPreKeyPublic: { type: String, required: true, maxlength: 512 },
    signedPreKeySignature: { type: String, required: true, maxlength: 512 },
    signatureVerification: {
      type: String,
      enum: ["structural-only", "verified"],
      required: true,
    },
    oneTimePreKeys: { type: [oneTimePreKeySchema], required: true, default: [] },
  },
  { timestamps: true },
);

export type PreKeySchema = InferSchemaType<typeof preKeySchema>;
export type PreKeyModelType = Model<PreKeySchema>;
export const PreKeyModel = ((models.PreKey as PreKeyModelType | undefined) ?? model("PreKey", preKeySchema)) as PreKeyModelType;
