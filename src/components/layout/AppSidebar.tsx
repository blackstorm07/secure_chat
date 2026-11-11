"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LockKeyhole, MessageSquare, Settings, Shield } from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { cn } from "@/lib/utils";

const links = [
  { href: "/chat", label: "Chats", icon: MessageSquare, active: (path: string) => path.startsWith("/chat") },
  { href: "/settings", label: "Settings", icon: Settings, active: (path: string, hash: string) => path === "/settings" && hash !== "#security" },
  { href: "/settings#security", label: "Security", icon: LockKeyhole, active: (path: string, hash: string) => path === "/settings" && hash === "#security" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [hash, setHash] = useState("");

  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [pathname]);

  return (
    <nav aria-label="Application" className="hidden w-[68px] shrink-0 flex-col items-center gap-2 border-r border-[var(--border)] bg-[var(--bg)] py-4 md:flex">
      <Link
        href="/chat"
        className="mb-5 grid h-11 w-11 place-items-center rounded-2xl bg-[var(--primary)] text-white shadow-[0_10px_24px_rgba(99,102,241,0.35)]"
        aria-label="SecureChat home"
      >
        <Shield className="h-5 w-5" aria-hidden="true" />
      </Link>
      {links.map((link) => {
        const active = link.active(pathname, hash);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            aria-label={link.label}
            title={link.label}
            className={cn(
              "grid h-11 w-11 place-items-center rounded-2xl transition",
              active ? "bg-[var(--primary)] text-white" : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </Link>
        );
      })}
      <div className="mt-auto">
        <ThemeToggle />
      </div>
    </nav>
  );
}
