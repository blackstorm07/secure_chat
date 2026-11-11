import { UserModel } from "@/models/User";
import { objectId } from "@/server/utils/ids";

export async function storedChatPinHash(userId: string): Promise<string | null> {
  const doc = await UserModel.collection.findOne({ _id: objectId(userId) }, { projection: { chatPinHash: 1 } });
  return typeof doc?.chatPinHash === "string" && doc.chatPinHash.length > 0 ? doc.chatPinHash : null;
}
