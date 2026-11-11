"use client";

import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useEffect, type ReactNode } from "react";
import { CallScreen } from "@/components/chat/CallScreen";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { MobileNavigation } from "@/components/layout/MobileNavigation";
import { Button } from "@/components/ui/Button";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { useAuth } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";

export function MainShell({ children }: { children: ReactNode }) {
  const { status, error, retry } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const inThread = pathname.startsWith("/chat/") && pathname !== "/chat";
  useSocket();

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [router, status]);

  if (status === "unknown") return <LoadingScreen label="Checking session" />;
  if (status === "anonymous") return <LoadingScreen label="Redirecting to login" />;
  if (status === "error") {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div className="grid max-w-sm gap-4">
          <p role="alert">{error ?? "The session could not be checked."}</p>
          <Button onClick={() => void retry()}>Try again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <AppSidebar />
      <div className={cn("flex min-w-0 flex-1 flex-col", inThread ? "pb-0" : "pb-16 md:pb-0")}>{children}</div>
      <MobileNavigation />
      <CallScreen />
    </div>
  );
}
