import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { POST as register } from "@/app/api/v1/auth/register/route";
import { POST as login } from "@/app/api/v1/auth/login/route";
import { POST as logout } from "@/app/api/v1/auth/logout/route";
import { GET as authMe } from "@/app/api/v1/auth/me/route";
import { POST as refresh } from "@/app/api/v1/auth/refresh/route";
import { GET as showProfile, PATCH as patchProfile } from "@/app/api/v1/users/me/route";
import { POST as deactivate } from "@/app/api/v1/users/me/deactivate/route";
import { GET as listDevices, POST as createDevice } from "@/app/api/v1/devices/route";
import { POST as revokeDevice } from "@/app/api/v1/devices/[id]/revoke/route";
import { POST as uploadKeys } from "@/app/api/v1/keys/upload/route";
import { POST as consumeKey } from "@/app/api/v1/keys/consume/route";
import { GET as showKeys } from "@/app/api/v1/keys/[userId]/[deviceId]/route";
import { GET as listConversations, POST as createConversation } from "@/app/api/v1/conversations/route";
import { GET as showConversation } from "@/app/api/v1/conversations/[id]/route";
import { POST as createMessage } from "@/app/api/v1/messages/route";
import { DELETE as deleteMessage, GET as listMessages } from "@/app/api/v1/messages/[id]/route";
import { POST as markDelivered } from "@/app/api/v1/messages/[id]/delivered/route";
import { POST as markRead } from "@/app/api/v1/messages/[id]/read/route";
import { POST as uploadUrl } from "@/app/api/v1/media/upload-url/route";
import { POST as confirmUpload } from "@/app/api/v1/media/confirm-upload/route";
import { POST as downloadUrl } from "@/app/api/v1/media/download-url/route";
import { DELETE as deleteMedia } from "@/app/api/v1/media/[id]/route";

type Handler = (request: Request) => Promise<Response>;

const routes: Array<{ method: string; pattern: RegExp; handler: Handler }> = [
  { method: "POST", pattern: /^\/api\/v1\/auth\/register$/, handler: register },
  { method: "POST", pattern: /^\/api\/v1\/auth\/login$/, handler: login },
  { method: "POST", pattern: /^\/api\/v1\/auth\/logout$/, handler: logout },
  { method: "GET", pattern: /^\/api\/v1\/auth\/me$/, handler: authMe },
  { method: "POST", pattern: /^\/api\/v1\/auth\/refresh$/, handler: refresh },
  { method: "GET", pattern: /^\/api\/v1\/users\/me$/, handler: showProfile },
  { method: "PATCH", pattern: /^\/api\/v1\/users\/me$/, handler: patchProfile },
  { method: "POST", pattern: /^\/api\/v1\/users\/me\/deactivate$/, handler: deactivate },
  { method: "GET", pattern: /^\/api\/v1\/devices$/, handler: listDevices },
  { method: "POST", pattern: /^\/api\/v1\/devices$/, handler: createDevice },
  { method: "POST", pattern: /^\/api\/v1\/devices\/[^/]+\/revoke$/, handler: revokeDevice },
  { method: "POST", pattern: /^\/api\/v1\/keys\/upload$/, handler: uploadKeys },
  { method: "POST", pattern: /^\/api\/v1\/keys\/consume$/, handler: consumeKey },
  { method: "GET", pattern: /^\/api\/v1\/keys\/[^/]+\/[^/]+$/, handler: showKeys },
  { method: "GET", pattern: /^\/api\/v1\/conversations$/, handler: listConversations },
  { method: "POST", pattern: /^\/api\/v1\/conversations$/, handler: createConversation },
  { method: "GET", pattern: /^\/api\/v1\/conversations\/[^/]+$/, handler: showConversation },
  { method: "POST", pattern: /^\/api\/v1\/messages$/, handler: createMessage },
  { method: "GET", pattern: /^\/api\/v1\/messages\/[^/]+$/, handler: listMessages },
  { method: "DELETE", pattern: /^\/api\/v1\/messages\/[^/]+$/, handler: deleteMessage },
  { method: "POST", pattern: /^\/api\/v1\/messages\/[^/]+\/delivered$/, handler: markDelivered },
  { method: "POST", pattern: /^\/api\/v1\/messages\/[^/]+\/read$/, handler: markRead },
  { method: "POST", pattern: /^\/api\/v1\/media\/upload-url$/, handler: uploadUrl },
  { method: "POST", pattern: /^\/api\/v1\/media\/confirm-upload$/, handler: confirmUpload },
  { method: "POST", pattern: /^\/api\/v1\/media\/download-url$/, handler: downloadUrl },
  { method: "DELETE", pattern: /^\/api\/v1\/media\/[^/]+$/, handler: deleteMedia },
];

export function createApiServer() {
  return createServer((incoming, outgoing) => {
    void serve(incoming, outgoing);
  });
}

async function serve(incoming: IncomingMessage, outgoing: ServerResponse): Promise<void> {
  const url = new URL(incoming.url ?? "/", "http://localhost");
  const route = routes.find((item) => item.method === incoming.method && item.pattern.test(url.pathname));
  if (!route) {
    outgoing.statusCode = 404;
    outgoing.end(JSON.stringify({ success: false, message: "Not found", errorCode: "NOT_FOUND" }));
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of incoming) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const body = Buffer.concat(chunks);
  const request = new Request(`http://localhost${incoming.url}`, {
    method: incoming.method,
    headers: headersFrom(incoming),
    body: body.byteLength > 0 && incoming.method !== "GET" && incoming.method !== "HEAD" ? body : undefined,
  });
  const response = await route.handler(request);
  await writeResponse(outgoing, response);
}

function headersFrom(incoming: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(incoming.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

async function writeResponse(outgoing: ServerResponse, response: Response): Promise<void> {
  outgoing.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    outgoing.setHeader(key, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) outgoing.setHeader("set-cookie", cookies);
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}
