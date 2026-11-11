"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { lockChat, usePinStore } from "@/store/pin.store";

export function SessionEvents() {
  const router = useRouter();
  const pathname = usePathname();
  const unlockedId = usePinStore((state) => state.unlockedId);
  useEffect(() => {
    const id = usePinStore.getState().unlockedId;
    if (!id) return;
    if (pathname !== `/chat/${id}`) lockChat();
  }, [pathname, unlockedId]);
  useEffect(() => {
    const onExpired = () => {
      const path = window.location.pathname;
      lockChat();
      if (path.startsWith("/login") || path.startsWith("/register")) return;
      router.replace("/login?reason=expired");
    };
    window.addEventListener("securechat:session-expired", onExpired);
    return () => window.removeEventListener("securechat:session-expired", onExpired);
  }, [router]);
  return null;
}
