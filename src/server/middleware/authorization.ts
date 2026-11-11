import { AppError } from "@/lib/errors";
import { ConversationMemberModel } from "@/models/ConversationMember";
import { DeviceModel } from "@/models/Device";
import { objectId } from "@/server/utils/ids";

export async function requireOwnedDevice(userId: string, deviceId: string, options?: { allowRevoked?: boolean }) {
  const device = await DeviceModel.findOne({
    _id: objectId(deviceId),
    userId: objectId(userId),
    ...(options?.allowRevoked ? {} : { deviceStatus: "active" }),
  });
  if (!device) throw new AppError(404, "NOT_FOUND", "Resource not found");
  return device;
}

export async function requireActiveMembership(conversationId: string, userId: string) {
  const member = await ConversationMemberModel.findOne({
    conversationId: objectId(conversationId),
    userId: objectId(userId),
    membershipStatus: "active",
  });
  if (!member) throw new AppError(404, "NOT_FOUND", "Resource not found");
  return member;
}

export async function listActiveMemberIds(conversationId: string): Promise<string[]> {
  const members = await ConversationMemberModel.find({
    conversationId: objectId(conversationId),
    membershipStatus: "active",
  });
  return members.map((member) => member.userId.toString());
}
