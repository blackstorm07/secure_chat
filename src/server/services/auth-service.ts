import { dummyPasswordHash, hashPassword, sha256, toPublicUser, verifyPassword, type PublicUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { connectMongo } from "@/lib/mongodb";
import { issueSession, revokeSession, rotateSession } from "@/lib/session";
import { UserModel } from "@/models/User";
import { LOGIN_ACCOUNT_LIMIT, LOGIN_IP_LIMIT, LOGIN_WINDOW_MS, REGISTER_IP_LIMIT, REGISTER_WINDOW_MS } from "@/server/config/constants";
import { assertRateLimit } from "@/server/middleware/rate-limit";
import { createUser, findUserByEmail } from "@/server/repositories/user-repository";
import { storedChatPinHash } from "@/server/services/chat-pin";
import { isDuplicateKey } from "@/server/utils/mongo-errors";

export interface AuthResult {
  user: PublicUser;
  csrfToken: string;
  token: string;
}

export async function registerAccount(input: { username: string; email: string; password: string }, userAgent: string, ip: string): Promise<AuthResult> {
  await assertRateLimit(`register:ip:${ip}`, REGISTER_IP_LIMIT, REGISTER_WINDOW_MS);
  await connectMongo();
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await createUser({ username: input.username, email: input.email, passwordHash });
    const session = await issueSession(user._id.toString(), "password", userAgent);
    return { user: toPublicUser(user), csrfToken: session.csrfToken, token: session.token };
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new AppError(409, "CONFLICT", "Unable to create account");
    }
    throw error;
  }
}

export async function loginAccount(input: { email: string; password: string }, userAgent: string, ip: string): Promise<AuthResult> {
  await assertRateLimit(`login:ip:${ip}`, LOGIN_IP_LIMIT, LOGIN_WINDOW_MS);
  await assertRateLimit(`login:account:${sha256(input.email)}`, LOGIN_ACCOUNT_LIMIT, LOGIN_WINDOW_MS);
  await connectMongo();
  const user = await findUserByEmail(input.email);
  const hash = user?.passwordHash ?? (await dummyPasswordHash());
  const matches = await verifyPassword(hash, input.password);
  if (!user || !matches || user.accountStatus !== "active" || !user.passwordHash) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }
  const session = await issueSession(user._id.toString(), "password", userAgent);
  const chatPinSet = Boolean(await storedChatPinHash(user._id.toString()));
  return { user: { ...toPublicUser(user), chatPinSet }, csrfToken: session.csrfToken, token: session.token };
}

export async function logoutAccount(sessionId: string): Promise<void> {
  await revokeSession(sessionId);
}

export async function refreshAccount(sessionId: string, userId: string, userAgent: string): Promise<AuthResult> {
  const current = await UserModel.findById(userId);
  if (!current || current.accountStatus !== "active") {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }
  const session = await rotateSession(sessionId, userId, "password", userAgent);
  const chatPinSet = Boolean(await storedChatPinHash(userId));
  return { user: { ...toPublicUser(current), chatPinSet }, csrfToken: session.csrfToken, token: session.token };
}
