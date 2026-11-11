import type { Metadata } from "next";
import { EmptyChat } from "@/components/chat/EmptyChat";

export const metadata: Metadata = { title: "Chats" };

export default function ChatPage() {
  return <EmptyChat />;
}
