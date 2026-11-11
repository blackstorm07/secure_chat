import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const userSchema = new Schema(
  {
    username: { type: String, required: true, lowercase: true, trim: true, minlength: 3, maxlength: 32 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false, maxlength: 512 },
    chatPinHash: { type: String, default: null, select: false, maxlength: 512 },
    profileImage: { type: String, default: null, maxlength: 2048 },
    accountStatus: { type: String, enum: ["active", "deactivated"], default: "active", required: true },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });
userSchema.set("toJSON", {
  transform(_doc, ret: Record<string, unknown>) {
    delete ret.passwordHash;
    delete ret.chatPinHash;
    return ret;
  },
});

export type UserSchema = InferSchemaType<typeof userSchema>;
export type UserModelType = Model<UserSchema>;

const chatPinPath = {
  chatPinHash: { type: String, default: null, select: false, maxlength: 512 },
} as const;

const existingUserModel = models.User as UserModelType | undefined;
if (existingUserModel && !existingUserModel.schema.path("chatPinHash")) {
  existingUserModel.schema.add(chatPinPath);
}

export const UserModel = (existingUserModel ?? model("User", userSchema)) as UserModelType;
