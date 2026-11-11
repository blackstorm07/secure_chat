"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LockKeyhole, MessageSquare, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/chat", label: "Chats", icon: MessageSquare, active: (path: string) => path.startsWith("/chat") },
  { href: "/settings", label: "Settings", icon: Settings, active: (path: string, hash: string) => path === "/settings" && hash !== "#security" },
  { href: "/settings#security", label: "Security", icon: LockKeyhole, active: (path: string, hash: string) => path === "/settings" && hash === "#security" },
];

export function MobileNavigation() {
  const pathname = usePathname();
  const [hash, setHash] = useState("");
  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [pathname]);

  if (pathname.startsWith("/chat/") && pathname !== "/chat") return null;
  return (
    <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-[var(--border)] bg-[var(--sidebar)] md:hidden">
      {links.map((link) => {
        const active = link.active(pathname, hash);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn("flex min-h-16 flex-col items-center justify-center gap-1 text-xs", active ? "text-[var(--primary)]" : "text-[var(--muted)]")}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
