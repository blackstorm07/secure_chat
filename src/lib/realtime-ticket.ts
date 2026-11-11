import { createHmac } from "node:crypto";
import { timingSafeEqualString } from "@/lib/auth";
import { REALTIME_TICKET_TTL_MS } from "@/server/config/constants";
import { getEnv } from "@/server/config/env";

const OBJECT_ID = /^[a-f\d]{24}$/i;
const CLOCK_SKEW_MS = 30_000;

export interface RealtimeTicketClaims {
  userId: string;
  sessionId: string;
  deviceId: string;
  expiresAt: number;
}

export function issueRealtimeTicket(
  claims: { userId: string; sessionId: string; deviceId: string },
  now = Date.now(),
): string {
  const expiresAt = now + REALTIME_TICKET_TTL_MS;
  const body = `1.${claims.userId}.${claims.sessionId}.${claims.deviceId}.${expiresAt}`;
  return `${body}.${sign(body)}`;
}

export function verifyRealtimeTicket(token: string, now = Date.now()): RealtimeTicketClaims | null {
  const parts = token.split(".");
  if (parts.length !== 6) return null;
  const [version, userId, sessionId, deviceId, expText, signature] = parts;
  if (version !== "1" || !userId || !sessionId || !deviceId || !expText || !signature) return null;
  if (!OBJECT_ID.test(userId) || !OBJECT_ID.test(sessionId) || !OBJECT_ID.test(deviceId)) return null;
  if (!/^\d{1,16}$/.test(expText)) return null;
  const expiresAt = Number(expText);
  const body = `1.${userId}.${sessionId}.${deviceId}.${expText}`;
  if (!timingSafeEqualString(signature, sign(body))) return null;
  if (expiresAt + CLOCK_SKEW_MS < now) return null;
  if (expiresAt > now + REALTIME_TICKET_TTL_MS + CLOCK_SKEW_MS) return null;
  return { userId, sessionId, deviceId, expiresAt };
}

function sign(body: string): string {
  return createHmac("sha256", getEnv().SESSION_SECRET).update(body).digest("base64url");
}
