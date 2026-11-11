import { createServer, type IncomingMessage } from "node:http";
import helmet from "helmet";
import { logger } from "@/lib/logger";
import { getEnv } from "@/server/config/env";
import { acceptRealtimeFanout } from "@/server/sockets/bus";
import { attachRealtimeServer } from "@/server/sockets/server";

const env = getEnv();
const secureHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: "same-origin" },
  referrerPolicy: { policy: "no-referrer" },
  frameguard: { action: "deny" },
  hsts: env.NODE_ENV === "production" ? { maxAge: 31_536_000, includeSubDomains: true } : false,
});

const server = createServer((request, response) => {
  if (request.url?.startsWith("/socket.io")) return;
  if (request.method === "POST" && request.url === "/internal/events") {
    void acceptLoopbackEvent(request, response);
    return;
  }
  secureHeaders(request, response, () => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ success: true, message: "Realtime service is running", data: { status: "ok" } }));
      return;
    }
    response.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ success: false, message: "Not found", errorCode: "NOT_FOUND" }));
  });
});

attachRealtimeServer(server);
server.listen(env.REALTIME_PORT, () => {
  logger.info({ port: env.REALTIME_PORT }, "realtime service listening");
});

const FANOUT_BODY_LIMIT = 1_500_000;

function isLoopback(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

async function acceptLoopbackEvent(
  request: IncomingMessage,
  response: { writeHead: (status: number, headers?: Record<string, string>) => void; end: (body?: string) => void },
): Promise<void> {
  if (!isLoopback(request.socket.remoteAddress)) {
    response.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ success: false, message: "Not found", errorCode: "NOT_FOUND" }));
    return;
  }
  try {
    const body = await readBody(request, FANOUT_BODY_LIMIT);
    const token = request.headers["x-realtime-token"];
    const accepted = acceptRealtimeFanout(body, Array.isArray(token) ? token[0] : token);
    response.writeHead(accepted ? 204 : 403, { "cache-control": "no-store" });
    response.end();
  } catch {
    response.writeHead(413, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ success: false, message: "Payload too large", errorCode: "VALIDATION_ERROR" }));
  }
}

function readBody(request: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Payload too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}
