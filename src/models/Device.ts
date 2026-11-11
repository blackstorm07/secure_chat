import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const deviceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    deviceName: { type: String, required: true, maxlength: 64 },
    identityPublicKey: { type: String, required: true, maxlength: 512 },
    registrationId: { type: Number, required: true, min: 1, max: 16_777_215 },
    deviceStatus: { type: String, enum: ["active", "revoked"], default: "active", required: true },
    lastActiveAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

deviceSchema.index({ userId: 1, identityPublicKey: 1 }, { unique: true });
deviceSchema.index({ userId: 1, deviceStatus: 1 });

export type DeviceSchema = InferSchemaType<typeof deviceSchema>;
export type DeviceModelType = Model<DeviceSchema>;
export const DeviceModel = ((models.Device as DeviceModelType | undefined) ?? model("Device", deviceSchema)) as DeviceModelType;
