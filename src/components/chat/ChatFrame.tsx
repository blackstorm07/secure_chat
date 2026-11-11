"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { cn } from "@/lib/utils";

export function ChatFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const inThread = pathname.startsWith("/chat/") && pathname !== "/chat";
  return (
    <div className="flex min-h-0 flex-1">
      <div className={cn("min-h-0 w-full md:flex md:w-[308px] md:max-w-[308px] md:shrink-0", inThread ? "hidden" : "flex")}>
        <ChatSidebar />
      </div>
      <div className={cn("min-h-0 min-w-0 flex-1", inThread ? "flex" : "hidden md:flex")}>{children}</div>
    </div>
  );
}
