import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";

const uriFile = path.join(path.dirname(fileURLToPath(import.meta.url)), ".mongo-uri");
let server: MongoMemoryServer | undefined;

export async function setup(): Promise<void> {
  server = await MongoMemoryServer.create();
  writeFileSync(uriFile, server.getUri(), "utf8");
}

export async function teardown(): Promise<void> {
  await server?.stop();
  rmSync(uriFile, { force: true });
}
