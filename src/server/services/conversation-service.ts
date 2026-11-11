import { AppError } from "@/lib/errors";
import { connectMongo } from "@/lib/mongodb";
import { ConversationMemberModel } from "@/models/ConversationMember";
import { ConversationModel } from "@/models/Conversation";
import { DeviceModel } from "@/models/Device";
import { UserModel } from "@/models/User";
import { requireActiveMembership } from "@/server/middleware/authorization";
import { publishRealtime } from "@/server/sockets/bus";
import type { ConversationDto, MemberRole, MembershipStatus } from "@/types";
import { objectId } from "@/server/utils/ids";
import { isDuplicateKey } from "@/server/utils/mongo-errors";

export async function createDirectConversation(userId: string, participantUserId: string): Promise<{ conversation: ConversationDto; created: boolean }> {
  if (userId === participantUserId) {
    throw new AppError(400, "VALIDATION_ERROR", "A direct conversation requires another user");
  }
  await connectMongo();
  const participant = await UserModel.findOne({ _id: objectId(participantUserId), accountStatus: "active" });
  if (!participant) throw new AppError(404, "NOT_FOUND", "Resource not found");
  const directKey = [userId, participantUserId].sort().join(":");
  const existing = await ConversationModel.findOne({ directKey });
  if (existing) {
    await requireActiveMembership(existing._id.toString(), userId);
    return { conversation: await toConversationDto(existing), created: false };
  }
  try {
    const conversation = await ConversationModel.create({
      conversationType: "direct",
      createdBy: objectId(userId),
      directKey,
    });
    const joinedAt = new Date();
    await ConversationMemberModel.create([
      { conversationId: conversation._id, userId: objectId(userId), role: "owner", membershipStatus: "active", joinedAt },
      { conversationId: conversation._id, userId: objectId(participantUserId), role: "member", membershipStatus: "active", joinedAt },
    ]);
    await publishRealtime({ type: "membership:joined", userId, conversationId: conversation._id.toString() });
    await publishRealtime({ type: "membership:joined", userId: participantUserId, conversationId: conversation._id.toString() });
    return { conversation: await toConversationDto(conversation), created: true };
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const conversation = await ConversationModel.findOne({ directKey });
    if (!conversation) throw error;
    await requireActiveMembership(conversation._id.toString(), userId);
    return { conversation: await toConversationDto(conversation), created: false };
  }
}

export async function listConversations(userId: string): Promise<ConversationDto[]> {
  await connectMongo();
  const memberships = await ConversationMemberModel.find({ userId: objectId(userId), membershipStatus: "active" }).limit(100);
  const ids = memberships.map((member) => member.conversationId);
  const conversations = await ConversationModel.find({ _id: { $in: ids } }).sort({ updatedAt: -1 });
  return Promise.all(conversations.map((conversation) => toConversationDto(conversation)));
}

export async function getConversation(userId: string, conversationId: string): Promise<ConversationDto> {
  await connectMongo();
  await requireActiveMembership(conversationId, userId);
  const conversation = await ConversationModel.findById(objectId(conversationId));
  if (!conversation) throw new AppError(404, "NOT_FOUND", "Resource not found");
  return toConversationDto(conversation);
}

async function toConversationDto(conversation: {
  _id: { toString(): string };
  conversationType: "direct" | "group";
  createdBy: { toString(): string };
  createdAt: Date;
  updatedAt: Date;
}): Promise<ConversationDto> {
  const members = await ConversationMemberModel.find({ conversationId: objectId(conversation._id.toString()) });
  const memberUserIds = members.map((member) => member.userId);
  const activeUserIds = members.filter((member) => member.membershipStatus === "active").map((member) => member.userId);
  const accounts = memberUserIds.length ? await UserModel.find({ _id: { $in: memberUserIds } }).select("username") : [];
  const usernames = new Map(accounts.map((account) => [account._id.toString(), account.username]));
  const devices = activeUserIds.length
    ? await DeviceModel.find({ userId: { $in: activeUserIds }, deviceStatus: "active" }).sort({ createdAt: 1 })
    : [];
  const devicesByUser = new Map<string, Array<{ id: string; registrationId: number; identityPublicKey: string }>>();
  for (const device of devices) {
    const userId = device.userId.toString();
    const list = devicesByUser.get(userId) ?? [];
    list.push({ id: device._id.toString(), registrationId: device.registrationId, identityPublicKey: device.identityPublicKey });
    devicesByUser.set(userId, list);
  }
  return {
    id: conversation._id.toString(),
    conversationType: conversation.conversationType,
    createdBy: conversation.createdBy.toString(),
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    members: members.map((member) => ({
      userId: member.userId.toString(),
      username: usernames.get(member.userId.toString()) ?? "",
      role: member.role as MemberRole,
      membershipStatus: member.membershipStatus as MembershipStatus,
      joinedAt: member.joinedAt.toISOString(),
      devices: devicesByUser.get(member.userId.toString()) ?? [],
    })),
  };
}
