import { createHmac } from "node:crypto";
import { timingSafeEqualString } from "@/lib/auth";
import { logWarn } from "@/lib/logger";
import { getRedis, getRedisSubscriber } from "@/lib/redis";
import { getEnv } from "@/server/config/env";
import { realtimeEventSchema } from "@/server/validators/socket";
import type { z } from "zod";

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;

const CHANNEL = "securechat:realtime";
const listeners = new Set<(event: RealtimeEvent) => void>();
let subscribed = false;

export function subscribeRealtime(listener: (event: RealtimeEvent) => void): () => void {
  listeners.add(listener);
  ensureRedisSubscription();
  return () => listeners.delete(listener);
}

export function realtimeFanoutToken(body: string): string {
  return createHmac("sha256", getEnv().SESSION_SECRET).update(body).digest("base64url");
}

export function acceptRealtimeFanout(body: string, token: string | undefined): boolean {
  const expected = realtimeFanoutToken(body);
  if (!token || !timingSafeEqualString(token, expected)) return false;
  let parsed: ReturnType<typeof realtimeEventSchema.safeParse>;
  try {
    parsed = realtimeEventSchema.safeParse(JSON.parse(body) as unknown);
  } catch {
    return false;
  }
  if (!parsed.success) return false;
  deliverLocal(parsed.data);
  return true;
}

export async function publishRealtime(event: RealtimeEvent): Promise<void> {
  const parsed = realtimeEventSchema.parse(event);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.publish(CHANNEL, JSON.stringify(parsed));
      return;
    } catch {
      logWarn({}, "realtime publish failed");
    }
  }
  if (listeners.size > 0 || process.env.NODE_ENV === "test") {
    deliverLocal(parsed);
    return;
  }
  await fanoutToRealtimeProcess(parsed);
}

async function fanoutToRealtimeProcess(event: RealtimeEvent): Promise<void> {
  const env = getEnv();
  const body = JSON.stringify(event);
  try {
    const response = await fetch(`http://127.0.0.1:${env.REALTIME_PORT}/internal/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-realtime-token": realtimeFanoutToken(body),
      },
      body,
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) logWarn({}, "realtime fanout rejected");
  } catch {
    logWarn({}, "realtime fanout unavailable");
  }
}

function deliverLocal(event: RealtimeEvent): void {
  for (const listener of listeners) listener(event);
}

function ensureRedisSubscription(): void {
  if (subscribed) return;
  const subscriber = getRedisSubscriber();
  if (!subscriber) return;
  subscribed = true;
  subscriber.subscribe(CHANNEL).catch(() => {
    subscribed = false;
    logWarn({}, "realtime subscribe failed");
  });
  subscriber.on("message", (channel, payload) => {
    if (channel !== CHANNEL) return;
    try {
      const parsed = realtimeEventSchema.safeParse(JSON.parse(payload) as unknown);
      if (parsed.success) deliverLocal(parsed.data);
    } catch {
      logWarn({}, "realtime payload rejected");
    }
  });
}
