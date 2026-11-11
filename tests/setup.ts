import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll } from "vitest";
import mongoose from "mongoose";
import { resetEnvCache } from "@/server/config/env";

const uriFile = path.join(path.dirname(fileURLToPath(import.meta.url)), ".mongo-uri");

Object.assign(process.env, {
  NODE_ENV: "test",
  MONGODB_URI: readFileSync(uriFile, "utf8").trim(),
  APP_URL: "http://localhost:3000",
  ALLOWED_ORIGINS: "http://localhost:3000",
  SESSION_SECRET: "test-session-secret-that-is-at-least-32-characters",
  LOG_LEVEL: "silent",
  REDIS_URL: "",
  CLOUDINARY_CLOUD_NAME: "",
  CLOUDINARY_API_KEY: "",
  CLOUDINARY_API_SECRET: "",
  CLOUDINARY_URL_EXPIRY: "",
});
resetEnvCache();

afterAll(async () => {
  await mongoose.disconnect();
});
