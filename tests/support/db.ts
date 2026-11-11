import mongoose from "mongoose";
import { connectMongo } from "@/lib/mongodb";
import { createModelIndexes } from "@/models/register";
import { resetRateLimitsForTests } from "@/server/middleware/rate-limit";

export async function resetDatabase(): Promise<void> {
  await connectMongo();
  const database = mongoose.connection.db;
  if (!database) throw new Error("MongoDB is not connected");
  await database.dropDatabase();
  await createModelIndexes();
  resetRateLimitsForTests();
}
