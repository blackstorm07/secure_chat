"use client";

import { useParams } from "next/navigation";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

export default function ConversationPage() {
  const params = useParams<{ conversationId: string }>();
  const conversationId = typeof params.conversationId === "string" ? params.conversationId : "";
  if (!conversationId) return <p className="p-6">Conversation not found.</p>;
  return (
    <ErrorBoundary>
      <ChatWindow conversationId={conversationId} />
    </ErrorBoundary>
  );
}
