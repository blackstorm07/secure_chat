import { randomToken } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { connectMongo } from "@/lib/mongodb";
import { AttachmentModel } from "@/models/Attachment";
import { ATTACHMENT_TTL_MS, MEDIA_UPLOAD_LIMIT, MEDIA_UPLOAD_WINDOW_MS } from "@/server/config/constants";
import { requireActiveMembership } from "@/server/middleware/authorization";
import { assertRateLimit } from "@/server/middleware/rate-limit";
import { getObjectStorage, type SignedObjectUrl } from "@/server/services/storage.service";
import { objectId } from "@/server/utils/ids";
import { Types } from "mongoose";

const KEY_PATTERN = /^m\/[A-Za-z0-9_-]{32,64}$/;

export async function createMediaUpload(
  userId: string,
  input: { conversationId: string; encryptedSize: number; encryptedMimeType: string; attachmentId?: string },
) {
  await assertRateLimit(`media:upload:${userId}`, MEDIA_UPLOAD_LIMIT, MEDIA_UPLOAD_WINDOW_MS);
  await connectMongo();
  await requireActiveMembership(input.conversationId, userId);
  if (input.attachmentId) return refreshUpload(userId, input.attachmentId, input);
  const attachmentId = new Types.ObjectId();
  const objectKey = opaqueObjectKey();
  const attachment = await AttachmentModel.create({
    _id: attachmentId,
    conversationId: objectId(input.conversationId),
    uploadedBy: objectId(userId),
    objectKey,
    encryptedSize: input.encryptedSize,
    encryptedMimeType: input.encryptedMimeType,
    status: "pending",
    expiresAt: new Date(Date.now() + ATTACHMENT_TTL_MS),
  });
  try {
    const signed = await getObjectStorage().createUploadUrl({
      key: objectKey,
      size: input.encryptedSize,
      mimeType: input.encryptedMimeType,
    });
    return uploadPayload(attachment._id.toString(), objectKey, signed);
  } catch (error) {
    await attachment.deleteOne();
    throw error;
  }
}

export async function confirmMediaUpload(userId: string, attachmentId: string) {
  await connectMongo();
  const attachment = await ownedAttachment(userId, attachmentId);
  await requireActiveMembership(attachment.conversationId.toString(), userId);
  await getObjectStorage().validateUpload(attachment.objectKey, attachment.encryptedSize, attachment.encryptedMimeType);
  if (attachment.status !== "ready") {
    attachment.status = "ready";
    await attachment.save();
  }
  return { attachmentId: attachment._id.toString(), status: "ready" as const };
}

export async function createMediaDownload(userId: string, attachmentId: string) {
  await connectMongo();
  const attachment = await AttachmentModel.findById(objectId(attachmentId));
  if (!attachment) throw new AppError(404, "NOT_FOUND", "Resource not found");
  await requireActiveMembership(attachment.conversationId.toString(), userId);
  if (attachment.status !== "ready") throw new AppError(409, "UPLOAD_INCOMPLETE", "Encrypted upload is not confirmed");
  const signed = await getObjectStorage().createDownloadUrl({ key: attachment.objectKey });
  return { downloadUrl: signed.url, expiresIn: signed.expiresIn };
}

export async function deleteMedia(userId: string, attachmentId: string): Promise<void> {
  await connectMongo();
  const attachment = await ownedAttachment(userId, attachmentId);
  await requireActiveMembership(attachment.conversationId.toString(), userId);
  await getObjectStorage().remove(attachment.objectKey);
  await attachment.deleteOne();
}

async function refreshUpload(
  userId: string,
  attachmentId: string,
  input: { conversationId: string; encryptedSize: number; encryptedMimeType: string },
) {
  const attachment = await ownedAttachment(userId, attachmentId);
  if (attachment.status !== "pending") throw new AppError(409, "CONFLICT", "Upload is already confirmed");
  if (attachment.conversationId.toString() !== input.conversationId) throw new AppError(404, "NOT_FOUND", "Resource not found");
  if (attachment.encryptedSize !== input.encryptedSize || attachment.encryptedMimeType !== input.encryptedMimeType) {
    throw new AppError(409, "MEDIA_MISMATCH", "Uploaded object metadata does not match");
  }
  const signed = await getObjectStorage().createUploadUrl({
    key: attachment.objectKey,
    size: attachment.encryptedSize,
    mimeType: attachment.encryptedMimeType,
  });
  return uploadPayload(attachment._id.toString(), attachment.objectKey, signed);
}

async function ownedAttachment(userId: string, attachmentId: string) {
  const attachment = await AttachmentModel.findOne({ _id: objectId(attachmentId), uploadedBy: objectId(userId) });
  if (!attachment) throw new AppError(404, "NOT_FOUND", "Resource not found");
  return attachment;
}

function opaqueObjectKey(): string {
  const key = `m/${randomToken(32)}`;
  if (!KEY_PATTERN.test(key)) throw new AppError(500, "INTERNAL_ERROR", "Something went wrong");
  return key;
}

function uploadPayload(attachmentId: string, objectKey: string, signed: SignedObjectUrl) {
  if (!signed.fields) throw new AppError(503, "STORAGE_UNAVAILABLE", "Object storage is unavailable");
  return {
    attachmentId,
    objectKey,
    uploadUrl: signed.url,
    expiresIn: signed.expiresIn,
    fields: signed.fields,
  };
}
