"use client";

import { useEffect, useRef, useState } from "react";
import { markDelivered, markRead } from "@/services/chat.service";
import { useAuthStore } from "@/store/auth.store";
import { useChatStore } from "@/store/chat.store";

const EMPTY_TYPING: string[] = [];

export function useMessages(conversationId: string) {
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const deviceId = useChatStore((state) => state.device?.deviceId ?? null);
  const thread = useChatStore((state) => state.threads[conversationId]);
  const typingIds = useChatStore((state) => state.typing[conversationId]);
  const loadMessages = useChatStore((state) => state.loadMessages);
  const setActive = useChatStore((state) => state.setActive);
  const [visible, setVisible] = useState(true);
  const receiptIds = useRef(new Set<string>());

  useEffect(() => {
    setActive(conversationId);
    void loadMessages(conversationId, "latest");
    return () => setActive(null);
  }, [conversationId, deviceId, loadMessages, setActive]);

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!csrfToken || !deviceId || !thread) return;
    for (const item of thread.items) {
      if (item.recipientDeviceId !== deviceId || item.senderUserId === userId) continue;
      if (visible && !item.readAt && !receiptIds.current.has(item.id)) {
        receiptIds.current.add(item.id);
        void markRead(csrfToken, item.id)
          .then((message) => useChatStore.getState().upsertMessage(message))
          .catch(() => receiptIds.current.delete(item.id));
        continue;
      }
      const deliveryKey = `delivered:${item.id}`;
      if (!item.deliveredAt && !item.readAt && !receiptIds.current.has(deliveryKey)) {
        receiptIds.current.add(deliveryKey);
        void markDelivered(csrfToken, item.id)
          .then((message) => useChatStore.getState().upsertMessage(message))
          .catch(() => receiptIds.current.delete(deliveryKey));
      }
    }
  }, [csrfToken, deviceId, thread, userId, visible]);

  return {
    thread,
    typing: typingIds ? typingIds.filter((id) => id !== userId) : EMPTY_TYPING,
    userId,
    loadOlder: () => loadMessages(conversationId, "older"),
  };
}
