import Redis from "ioredis";
import { logWarn } from "@/lib/logger";
import { getEnv } from "@/server/config/env";

let client: Redis | null = null;
let subscriber: Redis | null = null;
let disabled = false;

function createClient(url: string): Redis {
  const redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  redis.on("error", () => {
    disabled = true;
    logWarn({}, "redis connection failed; using in-process fallback");
  });
  return redis;
}

export function getRedis(): Redis | null {
  if (disabled) return null;
  const url = getEnv().REDIS_URL;
  if (!url) return null;
  client ??= createClient(url);
  return client;
}

export function getRedisSubscriber(): Redis | null {
  if (disabled) return null;
  const url = getEnv().REDIS_URL;
  if (!url) return null;
  subscriber ??= createClient(url);
  return subscriber;
}
