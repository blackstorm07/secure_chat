import { hashPassword, toPublicUser, verifyPassword, type PublicUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { connectMongo } from "@/lib/mongodb";
import { revokeUserSessions } from "@/lib/session";
import { UserModel } from "@/models/User";
import { storedChatPinHash } from "@/server/services/chat-pin";
import { objectId } from "@/server/utils/ids";
import { isDuplicateKey } from "@/server/utils/mongo-errors";

async function publicUser(userId: string): Promise<PublicUser> {
  const user = await UserModel.findById(objectId(userId));
  if (!user || user.accountStatus !== "active") {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }
  return { ...toPublicUser(user), chatPinSet: Boolean(await storedChatPinHash(userId)) };
}

export async function getProfile(userId: string): Promise<PublicUser> {
  await connectMongo();
  return publicUser(userId);
}

export async function updateProfile(
  userId: string,
  input: { username?: string; profileImage?: string | null },
): Promise<PublicUser> {
  await connectMongo();
  try {
    const update: { username?: string; profileImage?: string | null } = {};
    if (input.username !== undefined) update.username = input.username;
    if (input.profileImage !== undefined) update.profileImage = input.profileImage;
    const user = await UserModel.findOneAndUpdate(
      { _id: objectId(userId), accountStatus: "active" },
      { $set: update },
      { returnDocument: "after", runValidators: true },
    );
    if (!user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    return { ...toPublicUser(user), chatPinSet: Boolean(await storedChatPinHash(userId)) };
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError(409, "CONFLICT", "Unable to update profile");
    throw error;
  }
}

export async function setChatPin(userId: string, pin: string, currentPin?: string): Promise<PublicUser> {
  await connectMongo();
  const id = objectId(userId);
  const existing = await UserModel.collection.findOne({ _id: id }, { projection: { accountStatus: 1, chatPinHash: 1 } });
  if (!existing || existing.accountStatus !== "active") throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  const currentHash = typeof existing.chatPinHash === "string" ? existing.chatPinHash : "";
  if (currentHash) {
    if (!currentPin) throw new AppError(400, "VALIDATION_ERROR", "Enter the current PIN");
    const matches = await verifyPassword(currentHash, currentPin);
    if (!matches) throw new AppError(401, "INVALID_CREDENTIALS", "The current PIN is wrong");
  }
  const chatPinHash = await hashPassword(pin);
  const updated = await UserModel.collection.updateOne({ _id: id, accountStatus: "active" }, { $set: { chatPinHash } });
  if (updated.matchedCount !== 1) throw new AppError(500, "INTERNAL_ERROR", "Chat PIN could not be saved");
  return publicUser(userId);
}

export async function verifyChatPin(userId: string, pin: string): Promise<void> {
  await connectMongo();
  const chatPinHash = await storedChatPinHash(userId);
  if (!chatPinHash) throw new AppError(400, "VALIDATION_ERROR", "Set a 4-digit PIN in Settings first");
  const matches = await verifyPassword(chatPinHash, pin);
  if (!matches) throw new AppError(401, "INVALID_CREDENTIALS", "The PIN is wrong");
}

export async function deactivateAccount(userId: string, password: string): Promise<void> {
  await connectMongo();
  const user = await UserModel.findById(objectId(userId)).select("+passwordHash");
  if (!user?.passwordHash) throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  const matches = await verifyPassword(user.passwordHash, password);
  if (!matches) throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  user.accountStatus = "deactivated";
  await user.save();
  await revokeUserSessions(userId);
}
