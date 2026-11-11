import mongoose from "mongoose";
import { logError, logInfo } from "@/lib/logger";
import { getEnv } from "@/server/config/env";

interface MongoCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

const globalForMongo = globalThis as typeof globalThis & { __secureChatMongo?: MongoCache };
const cache: MongoCache = globalForMongo.__secureChatMongo ?? { conn: null, promise: null };
globalForMongo.__secureChatMongo = cache;

export async function connectMongo(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    const uri = getEnv().MONGODB_URI;
    mongoose.set("strictQuery", true);
    cache.promise = mongoose
      .connect(uri, {
        maxPoolSize: 10,
        minPoolSize: 1,
        serverSelectionTimeoutMS: 10_000,
        family: 4,
      })
      .then(async (connection) => {
        const { createModelIndexes } = await import("@/models/register");
        await createModelIndexes();
        logInfo({ readyState: connection.connection.readyState }, "mongodb connected");
        return connection;
      })
      .catch((error: unknown) => {
        cache.promise = null;
        logError(error, "mongodb connection failed");
        throw error;
      });
  }
  try {
    cache.conn = await cache.promise;
    return cache.conn;
  } catch (error) {
    cache.conn = null;
    cache.promise = null;
    throw error;
  }
}
