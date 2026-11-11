import { sha256, toPublicUser, randomToken, type AuthMethod, type PublicUser } from "@/lib/auth";
import { storedChatPinHash } from "@/server/services/chat-pin";
import { AppError } from "@/lib/errors";
import { connectMongo } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import {
  MAX_SESSIONS_PER_USER,
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  SESSION_TOUCH_INTERVAL_MS,
} from "@/server/config/constants";
import {
  createSessionRecord,
  findSessionById,
  findSessionByTokenHash,
  listActiveSessions,
  revokeActiveSessions,
  revokeSessionsByIds,
} from "@/server/repositories/session-repository";

export interface AuthenticatedSession {
  user: PublicUser;
  userId: string;
  sessionId: string;
  csrfToken: string;
}

export async function issueSession(userId: string, authMethod: AuthMethod, userAgent: string, absoluteExpiresAt?: Date) {
  await connectMongo();
  const now = new Date();
  const absolute = absoluteExpiresAt ?? new Date(now.getTime() + SESSION_ABSOLUTE_MS);
  if (absolute <= now) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }
  await pruneSessions(userId);
  const token = randomToken(32);
  const csrfToken = randomToken(32);
  const idleExpiry = new Date(Math.min(now.getTime() + SESSION_IDLE_MS, absolute.getTime()));
  const session = await createSessionRecord({
    userId,
    tokenHash: sha256(token),
    csrfToken,
    authMethod,
    expiresAt: idleExpiry,
    absoluteExpiresAt: absolute,
    lastUsedAt: now,
    userAgent: userAgent.slice(0, 256),
  });
  return { token, csrfToken, sessionId: session._id.toString(), absoluteExpiresAt: absolute };
}

export async function authenticateToken(token: string): Promise<AuthenticatedSession> {
  await connectMongo();
  return presentSession(await findSessionByTokenHash(sha256(token)));
}

export async function authenticateSessionId(sessionId: string, userId: string): Promise<AuthenticatedSession> {
  await connectMongo();
  let session: Awaited<ReturnType<typeof findSessionById>> = null;
  try {
    session = await findSessionById(sessionId);
  } catch (error) {
    if (error instanceof AppError && error.status === 400) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }
    throw error;
  }
  if (!session || session.userId.toString() !== userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }
  return presentSession(session);
}

export async function rotateSession(sessionId: string, userId: string, authMethod: AuthMethod, userAgent: string) {
  await connectMongo();
  const current = await findSessionByTokenHashOrId(sessionId);
  if (!current || current.revokedAt || current.userId.toString() !== userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }
  const replacement = await issueSession(userId, authMethod, userAgent, current.absoluteExpiresAt);
  current.revokedAt = new Date();
  await current.save();
  return replacement;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await connectMongo();
  const session = await findSessionByTokenHashOrId(sessionId);
  if (!session || session.revokedAt) return;
  session.revokedAt = new Date();
  await session.save();
}

export async function revokeUserSessions(userId: string): Promise<void> {
  await connectMongo();
  await revokeActiveSessions(userId, new Date());
}

async function pruneSessions(userId: string): Promise<void> {
  const active = await listActiveSessions(userId);
  const overflow = active.length - MAX_SESSIONS_PER_USER + 1;
  if (overflow <= 0) return;
  await revokeSessionsByIds(
    active.slice(0, overflow).map((session) => session._id.toString()),
    new Date(),
  );
}

async function presentSession(session: Awaited<ReturnType<typeof findSessionById>>): Promise<AuthenticatedSession> {
  if (!session || session.revokedAt) throw new AppError(401, "UNAUTHORIZED", "Authentication required");

  const now = new Date();
  if (session.expiresAt <= now || session.absoluteExpiresAt <= now) {
    session.revokedAt = now;
    await session.save();
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const user = await UserModel.findById(session.userId);
  if (!user || user.accountStatus !== "active") {
    session.revokedAt = now;
    await session.save();
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  if (now.getTime() - session.lastUsedAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
    session.lastUsedAt = now;
    const idleExpiry = new Date(now.getTime() + SESSION_IDLE_MS);
    session.expiresAt = idleExpiry < session.absoluteExpiresAt ? idleExpiry : session.absoluteExpiresAt;
    await session.save();
  }

  return {
    user: { ...toPublicUser(user), chatPinSet: Boolean(await storedChatPinHash(user._id.toString())) },
    userId: user._id.toString(),
    sessionId: session._id.toString(),
    csrfToken: session.csrfToken,
  };
}

async function findSessionByTokenHashOrId(sessionId: string) {
  return findSessionById(sessionId);
}
