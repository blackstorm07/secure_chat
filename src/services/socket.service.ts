import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";

export type ConnectionStatus = "offline" | "connecting" | "online" | "reconnecting";

export type CallKind = "invite" | "cancel" | "accept" | "decline" | "hangup" | "offer" | "answer" | "ice";

export interface CallSignal {
  conversationId: string;
  callId: string;
  kind: CallKind;
  fromUserId: string;
  media?: "audio" | "video";
  sdp?: string;
  candidate?: string | null;
}

export interface CallRequest {
  conversationId: string;
  callId: string;
  kind: CallKind;
  media?: "audio" | "video";
  sdp?: string;
  candidate?: string | null;
}

export type RealtimeNotice =
  | { type: "connection"; status: ConnectionStatus }
  | { type: "message"; conversationId: string }
  | { type: "delivered"; messageId: string; deliveredAt: string }
  | { type: "read"; messageId: string; readAt: string; deliveredAt: string }
  | { type: "typing"; conversationId: string; userId: string; state: "start" | "stop" }
  | { type: "presence"; userId: string; status: "online" | "offline" }
  | { type: "revoked"; deviceId: string }
  | { type: "call"; signal: CallSignal }
  | { type: "error"; message: string };

const CALL_KINDS = new Set<CallKind>(["invite", "cancel", "accept", "decline", "hangup", "offer", "answer", "ice"]);
const OBJECT_ID = /^[a-f\d]{24}$/i;
const CALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readCall(payload: unknown): CallSignal | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, unknown>;
  if (typeof value.conversationId !== "string" || !OBJECT_ID.test(value.conversationId)) return null;
  if (typeof value.callId !== "string" || !CALL_ID.test(value.callId)) return null;
  if (typeof value.kind !== "string" || !CALL_KINDS.has(value.kind as CallKind)) return null;
  if (typeof value.fromUserId !== "string" || !OBJECT_ID.test(value.fromUserId)) return null;
  const signal: CallSignal = { conversationId: value.conversationId, callId: value.callId, kind: value.kind as CallKind, fromUserId: value.fromUserId };
  if (value.media === "audio" || value.media === "video") signal.media = value.media;
  if (typeof value.sdp === "string") signal.sdp = value.sdp;
  if (typeof value.candidate === "string" || value.candidate === null) signal.candidate = value.candidate;
  return signal;
}

type Listener = (event: RealtimeNotice) => void;

function realtimeUrl(): string | null {
  if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    const host = window.location.hostname;
    const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
    if (!local) {
      const protocol = window.location.protocol === "https:" ? "https:" : "http:";
      return `${protocol}//${host}:3001`;
    }
  }
  const configured = process.env.NEXT_PUBLIC_REALTIME_URL?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    return `${protocol}//${window.location.hostname}:3001`;
  }
  return null;
}

class RealtimeClient {
  private socket: Socket | null = null;
  private listeners = new Set<Listener>();
  private deviceId: string | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  connect(deviceId: string): void {
    if (this.socket && this.deviceId === deviceId) return;
    this.disconnect();
    const url = realtimeUrl();
    if (!url) {
      this.emit({ type: "error", message: "Realtime URL is not configured" });
      this.emit({ type: "connection", status: "offline" });
      return;
    }
    this.deviceId = deviceId;
    this.emit({ type: "connection", status: "connecting" });
    const socket = io(url, {
      transports: ["websocket"],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      timeout: 10000,
      auth: { deviceId },
    });
    this.socket = socket;
    socket.on("connect", () => this.emit({ type: "connection", status: "online" }));
    socket.on("disconnect", () => {
      if (this.socket === socket) this.emit({ type: "connection", status: "reconnecting" });
    });
    socket.on("connect_error", () => {
      if (this.socket === socket) this.emit({ type: "connection", status: "reconnecting" });
    });
    socket.io.on("reconnect_attempt", () => this.emit({ type: "connection", status: "reconnecting" }));
    socket.on("message:receive", (payload: { conversationId?: string }) => {
      if (typeof payload?.conversationId === "string") this.emit({ type: "message", conversationId: payload.conversationId });
    });
    socket.on("message:delivered", (payload: { messageId?: string; deliveredAt?: string }) => {
      if (typeof payload?.messageId === "string" && typeof payload.deliveredAt === "string") {
        this.emit({ type: "delivered", messageId: payload.messageId, deliveredAt: payload.deliveredAt });
      }
    });
    socket.on("message:read", (payload: { messageId?: string; readAt?: string; deliveredAt?: string }) => {
      if (typeof payload?.messageId === "string" && typeof payload.readAt === "string" && typeof payload.deliveredAt === "string") {
        this.emit({ type: "read", messageId: payload.messageId, readAt: payload.readAt, deliveredAt: payload.deliveredAt });
      }
    });
    socket.on("typing:start", (payload: { conversationId?: string; userId?: string }) => {
      if (typeof payload?.conversationId === "string" && typeof payload.userId === "string") {
        this.emit({ type: "typing", conversationId: payload.conversationId, userId: payload.userId, state: "start" });
      }
    });
    socket.on("typing:stop", (payload: { conversationId?: string; userId?: string }) => {
      if (typeof payload?.conversationId === "string" && typeof payload.userId === "string") {
        this.emit({ type: "typing", conversationId: payload.conversationId, userId: payload.userId, state: "stop" });
      }
    });
    socket.on("user:online", (payload: { userId?: string }) => {
      if (typeof payload?.userId === "string") this.emit({ type: "presence", userId: payload.userId, status: "online" });
    });
    socket.on("user:offline", (payload: { userId?: string }) => {
      if (typeof payload?.userId === "string") this.emit({ type: "presence", userId: payload.userId, status: "offline" });
    });
    socket.on("device:revoked", (payload: { deviceId?: string }) => {
      if (typeof payload?.deviceId === "string") this.emit({ type: "revoked", deviceId: payload.deviceId });
    });
    socket.on("call:signal", (payload: unknown) => {
      const signal = readCall(payload);
      if (signal) this.emit({ type: "call", signal });
    });
    socket.on("event:error", (payload: { message?: string }) => {
      this.emit({ type: "error", message: payload?.message || "Realtime request failed" });
    });
  }

  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.deviceId = null;
  }

  sendTyping(conversationId: string, typing: boolean): void {
    this.socket?.emit(typing ? "typing:start" : "typing:stop", { conversationId });
  }

  isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  sendCall(payload: CallRequest): Promise<{ success: boolean; message?: string }> {
    const socket = this.socket;
    if (!socket?.connected) return Promise.resolve({ success: false, message: "Realtime is offline." });
    return new Promise((resolve) => {
      socket.timeout(8000).emit("call:signal", payload, (error: Error | null, response?: { success?: boolean; message?: string }) => {
        if (error || !response?.success) resolve({ success: false, message: response?.message || "The call could not be signaled." });
        else resolve({ success: true });
      });
    });
  }

  private emit(event: RealtimeNotice): void {
    for (const listener of this.listeners) listener(event);
  }
}

export const realtime = new RealtimeClient();

export function getRealtimeUrl(): string | null {
  return realtimeUrl();
}
