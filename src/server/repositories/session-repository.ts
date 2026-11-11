import { SessionModel } from "@/models/Session";
import type { AuthMethod } from "@/lib/auth";
import { objectId } from "@/server/utils/ids";

export async function createSessionRecord(input: {
  userId: string;
  tokenHash: string;
  csrfToken: string;
  authMethod: AuthMethod;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  lastUsedAt: Date;
  userAgent: string;
}) {
  return SessionModel.create({
    ...input,
    userId: objectId(input.userId),
    revokedAt: null,
  });
}

export async function findSessionByTokenHash(tokenHash: string) {
  return SessionModel.findOne({ tokenHash, revokedAt: null });
}

export async function findSessionById(sessionId: string) {
  return SessionModel.findById(objectId(sessionId));
}

export async function listActiveSessions(userId: string) {
  return SessionModel.find({ userId: objectId(userId), revokedAt: null }).sort({ createdAt: 1 });
}

export async function revokeSessionsByIds(ids: string[], revokedAt: Date) {
  if (ids.length === 0) return;
  await SessionModel.updateMany({ _id: { $in: ids.map((id) => objectId(id)) } }, { $set: { revokedAt } });
}

export async function revokeActiveSessions(userId: string, revokedAt: Date) {
  await SessionModel.updateMany({ userId: objectId(userId), revokedAt: null }, { $set: { revokedAt } });
}
