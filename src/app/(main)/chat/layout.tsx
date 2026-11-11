import type { ReactNode } from "react";
import { ChatFrame } from "@/components/chat/ChatFrame";

export default function ChatLayout({ children }: { children: ReactNode }) {
  return <ChatFrame>{children}</ChatFrame>;
}
