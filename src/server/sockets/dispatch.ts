import type { Server } from "socket.io";
import type { RealtimeEvent } from "@/server/sockets/bus";

export function dispatchRealtime(io: Server, event: RealtimeEvent): void {
  switch (event.type) {
    case "message:receive":
      io.to(`device:${event.targetDeviceId}`).emit("message:receive", event.payload);
      return;
    case "message:delivered":
      io.to(`device:${event.targetDeviceId}`).emit("message:delivered", event.payload);
      return;
    case "message:read":
      io.to(`device:${event.targetDeviceId}`).emit("message:read", event.payload);
      return;
    case "device:revoked":
      io.to(`device:${event.targetDeviceId}`).emit("device:revoked", { deviceId: event.targetDeviceId });
      for (const socket of io.sockets.sockets.values()) {
        if (socket.data.deviceId === event.targetDeviceId) socket.disconnect(true);
      }
      return;
    case "typing":
      io.to(`conversation:${event.conversationId}`).emit(event.state === "start" ? "typing:start" : "typing:stop", {
        conversationId: event.conversationId,
        userId: event.userId,
      });
      return;
    case "presence":
      for (const conversationId of event.conversationIds) {
        io.to(`conversation:${conversationId}`).emit(event.status === "online" ? "user:online" : "user:offline", {
          userId: event.userId,
        });
      }
      return;
    case "membership:joined":
      for (const socket of io.sockets.sockets.values()) {
        if (socket.data.userId === event.userId) void socket.join(`conversation:${event.conversationId}`);
      }
      return;
    case "call":
      io.to(`user:${event.targetUserId}`).emit("call:signal", event.payload);
      return;
    default:
      return;
  }
}

