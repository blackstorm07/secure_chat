import type { IncomingMessage } from "node:http";
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { AppError } from "@/lib/errors";
import { ZodError, type z } from "zod";
import { logWarn } from "@/lib/logger";
import { ConversationModel } from "@/models/Conversation";
import { ConversationMemberModel } from "@/models/ConversationMember";
import {
  CALL_SIGNAL_LIMIT,
  CALL_SIGNAL_WINDOW_MS,
  MAX_SOCKETS_PER_IP,
  MAX_SOCKETS_PER_USER,
  MESSAGE_EVENT_LIMIT,
  MESSAGE_EVENT_WINDOW_MS,
  SOCKET_EVENT_LIMIT,
  SOCKET_EVENT_WINDOW_MS,
} from "@/server/config/constants";
import { getEnv } from "@/server/config/env";
import { isAllowedOrigin } from "@/lib/security";
import { authenticateSocket } from "@/server/middleware/auth-middleware";
import { requireOwnedDevice } from "@/server/middleware/authorization";
import { createEncryptedMessages, markDelivered, markRead } from "@/server/services/message-service";
import { publishRealtime, subscribeRealtime } from "@/server/sockets/bus";
import { dispatchRealtime } from "@/server/sockets/dispatch";
import type { SocketData } from "@/server/sockets/types";
import { objectId } from "@/server/utils/ids";
import { createMessageSchema } from "@/server/validators/messages";
import { callSignalSchema, socketReceiptSchema, socketTypingSchema } from "@/server/validators/socket";

interface Bucket {
  count: number;
  resetAt: number;
}

export function attachRealtimeServer(server: HttpServer): Server {
  const env = getEnv();
  if (env.NODE_ENV === "production" && !env.REDIS_URL) {
    logWarn({}, "realtime service has no REDIS_URL; events stay on this process");
  }
  const userCounts = new Map<string, number>();
  const ipCounts = new Map<string, number>();
  const io = new Server(server, {
    cors: {
      origin(origin, callback) {
        if (isAllowedOrigin(origin ?? null)) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin is not allowed"), false);
      },
      credentials: true,
    },
    allowRequest(request, callback) {
      const origin = request.headers.origin;
      if (origin && !isAllowedOrigin(origin)) {
        callback("origin", false);
        return;
      }
      if (env.NODE_ENV === "production" && !isSecureRequest(request)) {
        callback("insecure", false);
        return;
      }
      callback(null, true);
    },
    maxHttpBufferSize: 1_500_000,
    transports: ["websocket"],
  });

  subscribeRealtime((event) => dispatchRealtime(io, event));

  io.use(async (socket, next) => {
    try {
      const deviceId = typeof socket.handshake.auth?.deviceId === "string" ? socket.handshake.auth.deviceId : "";
      const auth = await authenticateSocket(socket.handshake.headers.cookie, {
        deviceId,
        ticket: socket.handshake.auth?.ticket,
      });
      const device = await requireOwnedDevice(auth.userId, deviceId);
      const ip = clientAddress(socket.handshake.address);
      if ((userCounts.get(auth.userId) ?? 0) >= MAX_SOCKETS_PER_USER || (ipCounts.get(ip) ?? 0) >= MAX_SOCKETS_PER_IP) {
        next(new Error("Connection limit reached"));
        return;
      }
      socket.data = { userId: auth.userId, deviceId: device._id.toString(), sessionId: auth.sessionId };
      userCounts.set(auth.userId, (userCounts.get(auth.userId) ?? 0) + 1);
      ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1);
      socket.on("disconnect", () => {
        userCounts.set(auth.userId, Math.max(0, (userCounts.get(auth.userId) ?? 1) - 1));
        ipCounts.set(ip, Math.max(0, (ipCounts.get(ip) ?? 1) - 1));
      });
      next();
    } catch {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const data = socket.data as SocketData;
    void joinConversations(socket, data.userId).then(() => {
      announcePresence(data.userId, "online");
      replayPresence(io, socket, data.userId);
    });
    socket.on("disconnect", () => {
      const remaining = io.sockets.sockets.values();
      let stillConnected = false;
      for (const current of remaining) {
        if (current.id !== socket.id && current.data.userId === data.userId) stillConnected = true;
      }
      if (!stillConnected) void announcePresence(data.userId, "offline");
    });

    socket.on("message:send", (payload, ack) => {
      void handle(socket, ack, MESSAGE_EVENT_LIMIT, MESSAGE_EVENT_WINDOW_MS, async () => {
        const parsed = createMessageSchema.parse(payload);
        if (parsed.senderDeviceId !== data.deviceId) {
          throw new AppError(403, "FORBIDDEN", "Sender device is not active");
        }
        const result = await createEncryptedMessages(data.userId, parsed);
        return { success: true, message: result.created ? "Message stored" : "Message already stored", data: { messages: result.messages } };
      });
    });

    socket.on("message:delivered", (payload, ack) => {
      void handle(socket, ack, SOCKET_EVENT_LIMIT, SOCKET_EVENT_WINDOW_MS, async () => {
        const parsed = socketReceiptSchema.parse(payload);
        const message = await markDelivered(data.userId, parsed.messageId);
        return { success: true, message: "Message marked delivered", data: { message } };
      });
    });

    socket.on("message:read", (payload, ack) => {
      void handle(socket, ack, SOCKET_EVENT_LIMIT, SOCKET_EVENT_WINDOW_MS, async () => {
        const parsed = socketReceiptSchema.parse(payload);
        const message = await markRead(data.userId, parsed.messageId);
        return { success: true, message: "Message marked read", data: { message } };
      });
    });

    socket.on("typing:start", (payload, ack) => {
      void handle(socket, ack, SOCKET_EVENT_LIMIT, SOCKET_EVENT_WINDOW_MS, async () => {
        const parsed = socketTypingSchema.parse(payload);
        await publishTyping(data.userId, parsed.conversationId, "start");
        return { success: true, message: "Typing started", data: {} };
      });
    });

    socket.on("typing:stop", (payload, ack) => {
      void handle(socket, ack, SOCKET_EVENT_LIMIT, SOCKET_EVENT_WINDOW_MS, async () => {
        const parsed = socketTypingSchema.parse(payload);
        await publishTyping(data.userId, parsed.conversationId, "stop");
        return { success: true, message: "Typing stopped", data: {} };
      });
    });

    socket.on("call:signal", (payload, ack) => {
      void handle(socket, ack, CALL_SIGNAL_LIMIT, CALL_SIGNAL_WINDOW_MS, async () => {
        const parsed = callSignalSchema.parse(payload);
        await relayCall(data.userId, parsed);
        return { success: true, message: "Call signal delivered", data: {} };
      });
    });
  });

  return io;
}

async function joinConversations(socket: { join: (room: string) => void; data: SocketData }, userId: string) {
  socket.join(`user:${userId}`);
  socket.join(`device:${socket.data.deviceId}`);
  const memberships = await ConversationMemberModel.find({ userId: objectId(userId), membershipStatus: "active" });
  for (const membership of memberships) socket.join(`conversation:${membership.conversationId.toString()}`);
}

function replayPresence(
  io: Server,
  socket: { rooms: Set<string>; emit: (event: string, payload: unknown) => void },
  userId: string,
) {
  const announced = new Set<string>();
  for (const current of io.sockets.sockets.values()) {
    const otherId = current.data.userId;
    if (!otherId || otherId === userId || announced.has(otherId)) continue;
    const sharesRoom = [...current.rooms].some((room) => room.startsWith("conversation:") && socket.rooms.has(room));
    if (!sharesRoom) continue;
    announced.add(otherId);
    socket.emit("user:online", { userId: otherId });
  }
}

async function announcePresence(userId: string, status: "online" | "offline") {
  const memberships = await ConversationMemberModel.find({ userId: objectId(userId), membershipStatus: "active" });
  await publishRealtime({
    type: "presence",
    userId,
    status,
    conversationIds: memberships.map((membership) => membership.conversationId.toString()),
  });
}

async function relayCall(userId: string, signal: z.infer<typeof callSignalSchema>): Promise<void> {
  const conversation = await ConversationModel.findById(signal.conversationId);
  if (!conversation || conversation.conversationType !== "direct") {
    throw new AppError(404, "NOT_FOUND", "Resource not found");
  }
  const members = await ConversationMemberModel.find({
    conversationId: conversation._id,
    membershipStatus: "active",
  });
  const memberIds = members.map((member) => member.userId.toString());
  const peerId = memberIds.find((id) => id !== userId);
  if (!memberIds.includes(userId) || memberIds.length !== 2 || !peerId) {
    throw new AppError(404, "NOT_FOUND", "Resource not found");
  }
  const payload: {
    conversationId: string;
    callId: string;
    kind: z.infer<typeof callSignalSchema>["kind"];
    fromUserId: string;
    media?: "audio" | "video";
    sdp?: string;
    candidate?: string | null;
  } = {
    conversationId: signal.conversationId,
    callId: signal.callId,
    kind: signal.kind,
    fromUserId: userId,
  };
  if (signal.media) payload.media = signal.media;
  if (signal.sdp) payload.sdp = signal.sdp;
  if (signal.candidate !== undefined) payload.candidate = signal.candidate;
  await publishRealtime({ type: "call", targetUserId: peerId, payload });
  if (signal.kind === "accept" || signal.kind === "decline" || signal.kind === "cancel" || signal.kind === "hangup") {
    await publishRealtime({
      type: "call",
      targetUserId: userId,
      payload: { ...payload, kind: "cancel" },
    });
  }
}

async function publishTyping(userId: string, conversationId: string, state: "start" | "stop") {
  const membership = await ConversationMemberModel.findOne({
    conversationId: objectId(conversationId),
    userId: objectId(userId),
    membershipStatus: "active",
  });
  if (!membership) throw new AppError(404, "NOT_FOUND", "Resource not found");
  await publishRealtime({ type: "typing", conversationId, userId, state });
}

function handle(
  socket: { data: SocketData; emit: (event: string, payload: unknown) => void },
  ack: ((response: unknown) => void) | undefined,
  limit: number,
  windowMs: number,
  action: () => Promise<unknown>,
) {
  const buckets = (socket.data as SocketData & { buckets?: Map<string, Bucket> }).buckets ?? new Map<string, Bucket>();
  (socket.data as SocketData & { buckets?: Map<string, Bucket> }).buckets = buckets;
  const key = String(limit);
  if (!allow(buckets, key, limit, windowMs)) {
    const error = { success: false, message: "Too many requests", errorCode: "RATE_LIMITED" };
    if (typeof ack === "function") ack(error);
    else socket.emit("event:error", error);
    return Promise.resolve();
  }
  return action()
    .then((result) => {
      if (typeof ack === "function") ack(result);
    })
    .catch((error: unknown) => {
      const app =
        error instanceof AppError
          ? error
          : error instanceof ZodError
            ? new AppError(400, "VALIDATION_ERROR", "Validation failed")
            : new AppError(500, "INTERNAL_ERROR", "Something went wrong");
      const body = { success: false, message: app.message, errorCode: app.errorCode };
      if (typeof ack === "function") ack(body);
      else socket.emit("event:error", body);
    });
}

function allow(buckets: Map<string, Bucket>, key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

function clientAddress(address: string): string {
  return address || "unknown";
}

function isSecureRequest(request: IncomingMessage): boolean {
  const forwarded = request.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (proto === "https") return true;
  return Boolean((request.socket as { encrypted?: boolean }).encrypted);
}
