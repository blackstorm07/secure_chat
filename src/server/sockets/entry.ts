import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

const files =
  process.env.NODE_ENV === "production"
    ? [".env.production.local", ".env.local", ".env.production", ".env"]
    : [".env.development.local", ".env.local", ".env.development", ".env"];

async function main(): Promise<void> {
  for (const file of files) {
    if (existsSync(file)) loadEnvFile(file);
  }
  await import("./standalone");
}

void main();
