import { createServer } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { io, type Socket } from "socket.io-client";
import { attachRealtimeServer } from "@/server/sockets/server";
import { authHeaders, publicKey, registerAccount } from "./support/account";
import { resetDatabase } from "./support/db";
import { createApiServer } from "./support/http";

const api = request(createApiServer());
const httpServer = createServer();
let port = 0;

beforeAll(async () => {
  attachRealtimeServer(httpServer);
  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => resolve());
  });
  const address = httpServer.address();
  if (!address || typeof address === "string") throw new Error("Realtime port was not assigned");
  port = address.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    httpServer.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(resetDatabase);

function connect(cookie: string, deviceId: string, origin = "http://localhost:3000"): Socket {
  const token = cookie.slice("session=".length);
  return io(`http://127.0.0.1:${port}`, {
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
    timeout: 5000,
    extraHeaders: { cookie: `session=${token}`, origin },
    auth: { deviceId },
  });
}

function connected(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("socket timed out")), 5000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

describe("realtime authorization", () => {
  it("rejects a socket that has no session", async () => {
    const socket = connect("", "a".repeat(24));
    await expect(connected(socket)).rejects.toThrow(/Authentication failed/i);
    socket.close();
  });

  it("delivers an encrypted envelope only for an authorized member", async () => {
    const ada = await registerAccount(api, "ada", "ada@example.com");
    const grace = await registerAccount(api, "grace", "grace@example.com");
    const bob = await registerAccount(api, "bob", "bob@example.com");
    const adaDevice = await api.post("/api/v1/devices").set(authHeaders(ada.cookie, ada.csrf)).send({
      deviceName: "laptop",
      identityPublicKey: publicKey(),
      registrationId: 11,
    });
    const graceDevice = await api.post("/api/v1/devices").set(authHeaders(grace.cookie, grace.csrf)).send({
      deviceName: "phone",
      identityPublicKey: publicKey(),
      registrationId: 12,
    });
    const bobDevice = await api.post("/api/v1/devices").set(authHeaders(bob.cookie, bob.csrf)).send({
      deviceName: "tablet",
      identityPublicKey: publicKey(),
      registrationId: 13,
    });
    const conversation = await api.post("/api/v1/conversations").set(authHeaders(ada.cookie, ada.csrf)).send({
      conversationType: "direct",
      participantUserId: grace.userId,
    });
    const conversationId = conversation.body.data.conversation.id as string;
    const adaDeviceId = adaDevice.body.data.device.id as string;
    const graceDeviceId = graceDevice.body.data.device.id as string;
    const bobDeviceId = bobDevice.body.data.device.id as string;
    const sender = connect(ada.cookie, adaDeviceId);
    const recipient = connect(grace.cookie, graceDeviceId);
    const outsider = connect(bob.cookie, bobDeviceId);
    await Promise.all([connected(sender), connected(recipient), connected(outsider)]);
    const ciphertext = publicKey();
    let outsiderSaw = false;
    outsider.on("message:receive", () => {
      outsiderSaw = true;
    });
    const received = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("message was not delivered")), 5000);
      recipient.on("message:receive", (payload: { ciphertext?: string }) => {
        clearTimeout(timer);
        resolve(payload.ciphertext ?? "");
      });
    });
    const ack = await new Promise<{ success: boolean; errorCode?: string }>((resolve) => {
      sender.emit(
        "message:send",
        {
          conversationId,
          senderDeviceId: adaDeviceId,
          clientMessageId: "socket-message-1",
          messageType: "message",
          protocolVersion: "opaque-1",
          envelopes: [{ recipientDeviceId: graceDeviceId, ciphertext }],
        },
        (response: { success: boolean; errorCode?: string }) => resolve(response),
      );
    });
    expect(ack.success).toBe(true);
    await expect(received).resolves.toBe(ciphertext);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(outsiderSaw).toBe(false);

    const denied = await new Promise<{ success: boolean; errorCode?: string }>((resolve) => {
      outsider.emit(
        "message:send",
        {
          conversationId,
          senderDeviceId: bobDeviceId,
          clientMessageId: "socket-message-2",
          messageType: "message",
          protocolVersion: "opaque-1",
          envelopes: [{ recipientDeviceId: graceDeviceId, ciphertext }],
        },
        (response: { success: boolean; errorCode?: string }) => resolve(response),
      );
    });
    expect(denied.success).toBe(false);
    expect(denied.errorCode).toBe("NOT_FOUND");
    sender.close();
    recipient.close();
    outsider.close();
  });

  it("relays a call only to the other member of a direct conversation", async () => {
    const ada = await registerAccount(api, "ada", "ada@example.com");
    const grace = await registerAccount(api, "grace", "grace@example.com");
    const bob = await registerAccount(api, "bob", "bob@example.com");
    const adaDevice = await api.post("/api/v1/devices").set(authHeaders(ada.cookie, ada.csrf)).send({
      deviceName: "laptop",
      identityPublicKey: publicKey(),
      registrationId: 21,
    });
    const graceDevice = await api.post("/api/v1/devices").set(authHeaders(grace.cookie, grace.csrf)).send({
      deviceName: "phone",
      identityPublicKey: publicKey(),
      registrationId: 22,
    });
    const bobDevice = await api.post("/api/v1/devices").set(authHeaders(bob.cookie, bob.csrf)).send({
      deviceName: "tablet",
      identityPublicKey: publicKey(),
      registrationId: 23,
    });
    const conversation = await api.post("/api/v1/conversations").set(authHeaders(ada.cookie, ada.csrf)).send({
      conversationType: "direct",
      participantUserId: grace.userId,
    });
    const conversationId = conversation.body.data.conversation.id as string;
    const adaDeviceId = adaDevice.body.data.device.id as string;
    const graceDeviceId = graceDevice.body.data.device.id as string;
    const bobDeviceId = bobDevice.body.data.device.id as string;
    const sender = connect(ada.cookie, adaDeviceId);
    const recipient = connect(grace.cookie, graceDeviceId);
    const outsider = connect(bob.cookie, bobDeviceId);
    const joined = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("socket did not join")), 5000);
      recipient.once("typing:start", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    await Promise.all([connected(sender), connected(recipient), connected(outsider)]);
    sender.emit("typing:start", { conversationId });
    await joined;
    const callId = "11111111-1111-4111-8111-111111111111";
    let senderSaw = false;
    let outsiderSaw = false;
    sender.on("call:signal", () => {
      senderSaw = true;
    });
    outsider.on("call:signal", () => {
      outsiderSaw = true;
    });
    const received = new Promise<{ fromUserId?: string; media?: string; kind?: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("call was not signaled")), 5000);
      recipient.on("call:signal", (payload: { fromUserId?: string; media?: string; kind?: string }) => {
        if (payload.kind !== "invite") return;
        clearTimeout(timer);
        resolve(payload);
      });
    });
    const ack = await new Promise<{ success: boolean; errorCode?: string }>((resolve) => {
      sender.emit("call:signal", { conversationId, callId, kind: "invite", media: "video" }, (response: { success: boolean; errorCode?: string }) => resolve(response));
    });
    expect(ack.success).toBe(true);
    await expect(received).resolves.toMatchObject({ fromUserId: ada.userId, media: "video", kind: "invite" });
    const offer = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("offer was not signaled")), 5000);
      recipient.on("call:signal", (payload: { kind?: string; sdp?: string }) => {
        if (payload.kind !== "offer") return;
        clearTimeout(timer);
        resolve(payload.sdp ?? "");
      });
    });
    sender.emit("call:signal", { conversationId, callId, kind: "offer", sdp: "v=0" }, () => undefined);
    await expect(offer).resolves.toBe("v=0");
    const denied = await new Promise<{ success: boolean; errorCode?: string }>((resolve) => {
      outsider.emit(
        "call:signal",
        { conversationId, callId, kind: "invite", media: "audio" },
        (response: { success: boolean; errorCode?: string }) => resolve(response),
      );
    });
    expect(denied.success).toBe(false);
    expect(denied.errorCode).toBe("NOT_FOUND");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(senderSaw).toBe(false);
    expect(outsiderSaw).toBe(false);
    sender.close();
    recipient.close();
    outsider.close();
  });
});
