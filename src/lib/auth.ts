import argon2 from "argon2";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type AccountStatus = "active" | "deactivated";
export type AuthMethod = "password" | "passkey";

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  profileImage: string | null;
  accountStatus: AccountStatus;
  chatPinSet: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserIdentity {
  _id: { toString(): string };
  username: string;
  email: string;
  profileImage?: string | null;
  accountStatus: AccountStatus;
  chatPinHash?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function argonOptions(): argon2.HashOptions {
  const fast = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  if (process.env.NODE_ENV === "production") {
    return { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
  }
  if (fast) {
    return { type: argon2.argon2id, memoryCost: 8192, timeCost: 1, parallelism: 1 };
  }
  return { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
}

export async function hashPassword(password: string): Promise<string> {
  const hash = await argon2.hash(password, argonOptions());
  if (!hash.startsWith("$argon2id$")) {
    throw new Error("Password hasher did not produce an Argon2id hash");
  }
  return hash;
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  if (!hash.startsWith("$argon2id$")) return false;
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;

export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomToken(48));
  return dummyHash;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function toPublicUser(user: UserIdentity): PublicUser {
  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    profileImage: user.profileImage ?? null,
    accountStatus: user.accountStatus,
    chatPinSet: Boolean(user.chatPinHash),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
