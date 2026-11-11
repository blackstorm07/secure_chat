import { AppError } from "@/lib/errors";
import { connectMongo } from "@/lib/mongodb";
import { DeviceModel } from "@/models/Device";
import { MessageModel } from "@/models/Message";
import { MESSAGE_EXPIRY_MAX_MS } from "@/server/config/constants";
import { listActiveMemberIds, requireActiveMembership, requireOwnedDevice } from "@/server/middleware/authorization";
import { getMessageProtocolAdapter } from "@/server/services/protocol-adapter";
import { publishRealtime } from "@/server/sockets/bus";
import type { MessageDto, MessageType } from "@/types";
import { objectId } from "@/server/utils/ids";
import { isDuplicateKey } from "@/server/utils/mongo-errors";

const PRIVATE_MARKER = /BEGIN [A-Z0-9 ]*PRIVATE|PRIVATE KEY|OPENSSH PRIVATE/i;

export interface EnvelopeInput {
  recipientDeviceId: string;
  ciphertext: string;
}

export interface CreateMessageInput {
  conversationId: string;
  senderDeviceId: string;
  clientMessageId: string;
  messageType: MessageType;
  protocolVersion: string;
  expiresAt?: string;
  envelopes: EnvelopeInput[];
}

export async function createEncryptedMessages(userId: string, input: CreateMessageInput): Promise<{ messages: MessageDto[]; created: boolean }> {
  await connectMongo();
  await requireActiveMembership(input.conversationId, userId);
  const senderDevice = await requireOwnedDevice(userId, input.senderDeviceId);
  rejectPrivateMaterial(input.envelopes);
  const expiresAt = parseExpiry(input.expiresAt);
  const memberIds = await listActiveMemberIds(input.conversationId);
  const recipientIds = input.envelopes.map((item) => objectId(item.recipientDeviceId));
  const recipients = await DeviceModel.find({
    _id: { $in: recipientIds },
    userId: { $in: memberIds.map((id) => objectId(id)) },
    deviceStatus: "active",
  });
  if (recipients.length !== input.envelopes.length) {
    throw new AppError(400, "VALIDATION_ERROR", "Recipient device is not available");
  }
  const adapter = getMessageProtocolAdapter();
  for (const envelope of input.envelopes) {
    try {
      await adapter.validateEnvelope({
        messageType: input.messageType,
        protocolVersion: input.protocolVersion,
        ciphertext: envelope.ciphertext,
      });
    } catch {
      throw new AppError(400, "VALIDATION_ERROR", "Encrypted envelope was rejected");
    }
  }

  const stored: MessageDto[] = [];
  let createdCount = 0;
  for (const envelope of input.envelopes) {
    const result = await insertEnvelope({
      conversationId: input.conversationId,
      senderUserId: userId,
      senderDeviceId: senderDevice._id.toString(),
      recipientDeviceId: envelope.recipientDeviceId,
      ciphertext: envelope.ciphertext,
      messageType: input.messageType,
      protocolVersion: input.protocolVersion,
      clientMessageId: input.clientMessageId,
      expiresAt,
    });
    stored.push(result.message);
    if (result.created) {
      createdCount += 1;
      await publishRealtime({
        type: "message:receive",
        targetDeviceId: result.message.recipientDeviceId,
        payload: { id: result.message.id, ciphertext: result.message.ciphertext, conversationId: result.message.conversationId },
      });
    }
  }
  senderDevice.lastActiveAt = new Date();
  await senderDevice.save();
  return { messages: stored, created: createdCount > 0 };
}

export async function listMessages(userId: string, conversationId: string, cursor: string | undefined, limit: number) {
  await connectMongo();
  await requireActiveMembership(conversationId, userId);
  const devices = await DeviceModel.find({ userId: objectId(userId) });
  const deviceIds = devices.map((device) => device._id);
  const rows = await MessageModel.find({
    conversationId: objectId(conversationId),
    $or: [{ senderUserId: objectId(userId) }, { recipientDeviceId: { $in: deviceIds } }],
    ...(cursor ? { _id: { $lt: objectId(cursor) } } : {}),
  })
    .sort({ _id: -1 })
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    messages: page.map((message) => toMessageDto(message)),
    nextCursor: rows.length > limit && last ? last._id.toString() : null,
  };
}

export async function markDelivered(userId: string, messageId: string): Promise<MessageDto> {
  return markReceipt(userId, messageId, "delivered");
}

export async function markRead(userId: string, messageId: string): Promise<MessageDto> {
  return markReceipt(userId, messageId, "read");
}

export async function deleteMessage(userId: string, messageId: string): Promise<void> {
  await connectMongo();
  const message = await MessageModel.findById(objectId(messageId));
  if (!message) throw new AppError(404, "NOT_FOUND", "Resource not found");
  const recipient = await DeviceModel.findById(message.recipientDeviceId);
  const allowed = message.senderUserId.toString() === userId || recipient?.userId.toString() === userId;
  if (!allowed) throw new AppError(404, "NOT_FOUND", "Resource not found");
  await requireActiveMembership(message.conversationId.toString(), userId);
  await message.deleteOne();
}

async function markReceipt(userId: string, messageId: string, kind: "delivered" | "read"): Promise<MessageDto> {
  await connectMongo();
  const message = await MessageModel.findById(objectId(messageId));
  if (!message) throw new AppError(404, "NOT_FOUND", "Resource not found");
  const recipient = await DeviceModel.findOne({ _id: message.recipientDeviceId, userId: objectId(userId), deviceStatus: "active" });
  if (!recipient) throw new AppError(404, "NOT_FOUND", "Resource not found");
  await requireActiveMembership(message.conversationId.toString(), userId);
  const now = new Date();
  if (!message.deliveredAt) message.deliveredAt = now;
  if (kind === "read" && !message.readAt) message.readAt = now;
  await message.save();
  const dto = toMessageDto(message);
  if (kind === "read") {
    await publishRealtime({
      type: "message:read",
      targetDeviceId: dto.senderDeviceId,
      payload: {
        messageId: dto.id,
        readAt: dto.readAt ?? now.toISOString(),
        deliveredAt: dto.deliveredAt ?? now.toISOString(),
      },
    });
  } else {
    await publishRealtime({
      type: "message:delivered",
      targetDeviceId: dto.senderDeviceId,
      payload: { messageId: dto.id, deliveredAt: dto.deliveredAt ?? now.toISOString() },
    });
  }
  return dto;
}

async function insertEnvelope(input: {
  conversationId: string;
  senderUserId: string;
  senderDeviceId: string;
  recipientDeviceId: string;
  ciphertext: string;
  messageType: MessageType;
  protocolVersion: string;
  clientMessageId: string;
  expiresAt: Date | null;
}): Promise<{ message: MessageDto; created: boolean }> {
  try {
    const message = await MessageModel.create({
      conversationId: objectId(input.conversationId),
      senderUserId: objectId(input.senderUserId),
      senderDeviceId: objectId(input.senderDeviceId),
      recipientDeviceId: objectId(input.recipientDeviceId),
      ciphertext: input.ciphertext,
      messageType: input.messageType,
      protocolVersion: input.protocolVersion,
      clientMessageId: input.clientMessageId,
      expiresAt: input.expiresAt,
    });
    return { message: toMessageDto(message), created: true };
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const existing = await MessageModel.findOne({
      senderDeviceId: objectId(input.senderDeviceId),
      recipientDeviceId: objectId(input.recipientDeviceId),
      clientMessageId: input.clientMessageId,
    });
    if (!existing) throw error;
    return { message: toMessageDto(existing), created: false };
  }
}

function parseExpiry(value: string | undefined): Date | null {
  if (!value) return null;
  const expiresAt = new Date(value);
  const now = Date.now();
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now || expiresAt.getTime() > now + MESSAGE_EXPIRY_MAX_MS) {
    throw new AppError(400, "VALIDATION_ERROR", "expiresAt must be in the future and within 30 days");
  }
  return expiresAt;
}

function rejectPrivateMaterial(envelopes: EnvelopeInput[]): void {
  for (const envelope of envelopes) {
    if (PRIVATE_MARKER.test(envelope.ciphertext)) {
      throw new AppError(400, "VALIDATION_ERROR", "Private key material is not accepted");
    }
  }
}

export function toMessageDto(message: {
  _id: { toString(): string };
  conversationId: { toString(): string };
  senderUserId: { toString(): string };
  senderDeviceId: { toString(): string };
  recipientDeviceId: { toString(): string };
  ciphertext: string;
  messageType: MessageType;
  protocolVersion: string;
  clientMessageId: string;
  createdAt: Date;
  expiresAt?: Date | null;
  deliveredAt?: Date | null;
  readAt?: Date | null;
}): MessageDto {
  return {
    id: message._id.toString(),
    conversationId: message.conversationId.toString(),
    senderUserId: message.senderUserId.toString(),
    senderDeviceId: message.senderDeviceId.toString(),
    recipientDeviceId: message.recipientDeviceId.toString(),
    ciphertext: message.ciphertext,
    messageType: message.messageType,
    protocolVersion: message.protocolVersion,
    clientMessageId: message.clientMessageId,
    createdAt: message.createdAt.toISOString(),
    expiresAt: message.expiresAt ? message.expiresAt.toISOString() : null,
    deliveredAt: message.deliveredAt ? message.deliveredAt.toISOString() : null,
    readAt: message.readAt ? message.readAt.toISOString() : null,
  };
}
