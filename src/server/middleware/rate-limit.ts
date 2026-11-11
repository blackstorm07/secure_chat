import { logWarn } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { getRedis } from "@/lib/redis";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function resetRateLimitsForTests(): void {
  buckets.clear();
}

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const redis = getRedis();
  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.pexpire(key, windowMs);
      const ttl = await redis.pttl(key);
      const retryAfterSeconds = Math.max(1, Math.ceil((ttl > 0 ? ttl : windowMs) / 1000));
      return { allowed: count <= limit, retryAfterSeconds };
    } catch {
      logWarn({}, "rate limit store failed; using process memory");
    }
  }
  return consumeMemory(key, limit, windowMs);
}

function consumeMemory(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }
  current.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  return { allowed: current.count <= limit, retryAfterSeconds };
}

export async function assertRateLimit(key: string, limit: number, windowMs: number): Promise<void> {
  const result = await consumeRateLimit(key, limit, windowMs);
  if (!result.allowed) {
    throw new AppError(429, "RATE_LIMITED", "Too many requests", { retryAfterSeconds: result.retryAfterSeconds });
  }
}
