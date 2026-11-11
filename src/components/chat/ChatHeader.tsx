"use client";

import { ArrowLeft, MoreVertical, Phone, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { cn, visiblePresence } from "@/lib/utils";
import { useCallStore } from "@/store/call.store";
import { useChatStore } from "@/store/chat.store";

export function ChatHeader({
  title,
  peerId,
  conversationId,
  panel,
  onToggleDetails,
  image,
  tone,
  presenceOverride,
  locked = false,
  onDecrypt,
  onSnap,
}: {
  title: string;
  peerId: string | null;
  conversationId: string;
  panel: "auto" | "open" | "closed";
  onToggleDetails: () => void;
  image?: string | null;
  tone?: string;
  presenceOverride?: "online" | "offline" | "unknown";
  locked?: boolean;
  onDecrypt?: () => void;
  onSnap: () => void;
}) {
  const storedPresence = useChatStore((state) => (peerId ? state.presence[peerId] : undefined));
  const connection = useChatStore((state) => state.connection);
  const realtimeError = useChatStore((state) => state.realtimeError);
  const deviceError = useChatStore((state) => state.deviceError);
  const presence = visiblePresence(storedPresence, connection, presenceOverride);
  const status = presence === "online" ? "Online" : presence === "offline" ? "Offline" : "Status unknown";
  const connectionLabel = connection === "online" ? null : connection === "reconnecting" ? "Reconnecting" : connection === "connecting" ? "Connecting" : "Realtime offline";
  const [menuOpen, setMenuOpen] = useState(false);
  const [callNote, setCallNote] = useState<string | null>(null);
  const [offlineCallOpen, setOfflineCallOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const beginCall = (media: "audio" | "video") => {
    setMenuOpen(false);
    const call = useCallStore.getState();
    if (call.phase !== "idle" && call.phase !== "ended") {
      if (call.conversationId === conversationId) call.setMinimized(false);
      else setCallNote("You're already in a call.");
      return;
    }
    if (presence !== "online") {
      setOfflineCallOpen(true);
      return;
    }
    if (!peerId) {
      setCallNote("This chat is still loading.");
      return;
    }
    setCallNote(null);
    void call.startOutgoing({ conversationId, peerUserId: peerId, peerName: title, media });
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <>
    <header className="border-b border-[var(--border)] bg-[var(--chat)]/90 px-3 py-3 backdrop-blur-sm sm:px-4">
      <div className="flex items-center gap-2">
        <Link href="/chat" className="grid h-11 w-11 place-items-center rounded-xl hover:bg-[var(--hover)] md:hidden" aria-label="Back to conversations">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Avatar label={title} image={image} tone={tone} presence={presence} size="sm" dotBorder="border-[var(--chat)]" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{title}</h1>
          <p className={cn("truncate text-xs", presence === "online" ? "text-[var(--online)]" : "text-[var(--muted)]")}>
            {status}
            {connectionLabel ? <span className="text-[var(--muted)]"> · {connectionLabel}</span> : null}
          </p>
        </div>
        <IconButton label="Video call" onClick={() => beginCall("video")}>
          <Video className="h-5 w-5" />
        </IconButton>
        <IconButton label="Voice call" onClick={() => beginCall("audio")}>
          <Phone className="h-5 w-5" />
        </IconButton>
        <div className="relative" ref={menuRef}>
          <IconButton label={menuOpen ? "Close menu" : "More options"} aria-expanded={menuOpen} aria-haspopup="menu" onClick={() => setMenuOpen((value) => !value)}>
            <MoreVertical className="h-5 w-5" />
          </IconButton>
          {menuOpen ? (
            <div role="menu" className="absolute top-12 right-0 z-20 w-48 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-1 shadow-[var(--shadow)]">
              <button
                type="button"
                role="menuitem"
                className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--hover)]"
                onClick={() => {
                  setMenuOpen(false);
                  onSnap();
                }}
              >
                Snap camera
              </button>
              {locked && onDecrypt ? (
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--hover)]"
                  onClick={() => {
                    setMenuOpen(false);
                    onDecrypt();
                  }}
                >
                  Decrypt chat
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--hover)]"
                onClick={() => {
                  setMenuOpen(false);
                  onToggleDetails();
                }}
              >
                {panel === "open" ? (
                  "Hide contact info"
                ) : panel === "closed" ? (
                  "Contact info"
                ) : (
                  <>
                    <span className="xl:hidden">Contact info</span>
                    <span className="hidden xl:inline">Hide contact info</span>
                  </>
                )}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {callNote ? (
        <p className="mt-2 text-xs text-[var(--muted)]" role="status">
          {callNote}
        </p>
      ) : null}
      {deviceError || realtimeError ? (
        <p className="mt-2 text-sm text-[var(--danger)]" role="alert">
          {deviceError || realtimeError}
        </p>
      ) : null}
    </header>
    {offlineCallOpen ? (
      <Modal title="Call unavailable" onClose={() => setOfflineCallOpen(false)}>
        <p>Video and voice calls are only allowed when the user is online.</p>
        <div className="mt-5 flex justify-end">
          <Button onClick={() => setOfflineCallOpen(false)}>OK</Button>
        </div>
      </Modal>
    ) : null}
    </>
  );
}
