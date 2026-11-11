"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/auth.store";
import { useChatStore } from "@/store/chat.store";

export function useChat() {
  const status = useAuthStore((state) => state.status);
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const loadConversations = useChatStore((state) => state.loadConversations);
  const conversations = useChatStore((state) => state.conversations);
  const conversationsStatus = useChatStore((state) => state.conversationsStatus);
  const conversationsError = useChatStore((state) => state.conversationsError);
  const previews = useChatStore((state) => state.previews);
  const unread = useChatStore((state) => state.unread);
  const presence = useChatStore((state) => state.presence);
  const connection = useChatStore((state) => state.connection);

  useEffect(() => {
    if (status !== "authenticated" || !csrfToken) return;
    void loadConversations();
    const onFocus = () => void loadConversations();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => void loadConversations(), 30_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [csrfToken, loadConversations, status]);

  return { conversations, conversationsStatus, conversationsError, previews, unread, presence, connection, reload: loadConversations };
}
