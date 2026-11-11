"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { MessageBubble, toBubbles } from "@/components/chat/MessageBubble";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import type { ChatAttachment } from "@/lib/chat-text";
import { formatChatDay, formatClock, shortId } from "@/lib/utils";
import type { StoredMessage } from "@/types/message";

interface View {
  id: string;
  outgoing: boolean;
  createdAt: string;
  timeLabel: string;
  text?: string;
  attachment?: ChatAttachment | null;
  detail?: string;
  receipt?: "sent" | "delivered" | "read";
  onDelete?: () => void;
}

export function MessageList({
  items,
  selfId,
  typing,
  loadingOlder,
  hasOlder,
  onLoadOlder,
  onDelete,
  banner,
  locked = false,
}: {
  items: StoredMessage[];
  selfId: string | null;
  typing: string[];
  loadingOlder: boolean;
  hasOlder: boolean;
  onLoadOlder: () => void;
  onDelete: (ids: string[]) => void;
  banner?: string | null;
  locked?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const previousHeight = useRef(0);
  const views = useMemo(() => buildViews(items, selfId, onDelete, locked), [items, locked, onDelete, selfId]);
  const signature = views.map((view) => view.id).join("|");

  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    if (loadingOlder) {
      previousHeight.current = element.scrollHeight;
      return;
    }
    if (previousHeight.current > 0) {
      element.scrollTop = element.scrollHeight - previousHeight.current;
      previousHeight.current = 0;
      return;
    }
    if (stick.current) element.scrollTop = element.scrollHeight;
  }, [signature, loadingOlder, typing.length]);

  return (
    <div
      ref={container}
      className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8"
      onScroll={(event) => {
        const element = event.currentTarget;
        stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        if (element.scrollTop < 40 && hasOlder && !loadingOlder) onLoadOlder();
      }}
    >
      {banner ? <p className="mx-auto mb-4 w-fit rounded-full bg-[var(--sidebar)]/80 px-3 py-1 text-center text-[11px] text-[var(--muted)]">{banner}</p> : null}
      {hasOlder ? (
        <div className="mb-3 text-center">
          <button type="button" className="text-sm text-[var(--muted)] underline" onClick={onLoadOlder} disabled={loadingOlder}>
            {loadingOlder ? "Loading older messages" : "Load older messages"}
          </button>
        </div>
      ) : null}
      <div className="grid gap-3">
        {views.map((view, index) => {
          const day = view.createdAt.slice(0, 10);
          const previous = views[index - 1];
          const showDay = !previous || previous.createdAt.slice(0, 10) !== day;
          return (
            <div key={view.id} className="grid gap-3">
              {showDay ? (
                <p className="mx-auto w-fit rounded-full bg-[var(--sidebar)]/85 px-3 py-1 text-[11px] text-[var(--muted)]">{formatChatDay(view.createdAt)}</p>
              ) : null}
              <MessageBubble
                outgoing={view.outgoing}
                timeLabel={view.timeLabel}
                createdAt={view.createdAt}
                text={view.text}
                attachment={view.attachment}
                detail={view.detail}
                receipt={view.receipt}
                onDelete={view.onDelete}
              />
            </div>
          );
        })}
        {views.length === 0 ? <p className="py-16 text-center text-sm text-[var(--muted)]">No messages in this conversation yet.</p> : null}
      </div>
      <TypingIndicator labels={typing.map((id) => `User ${shortId(id)}`)} />
    </div>
  );
}

function buildViews(items: StoredMessage[], selfId: string | null, onDelete: (ids: string[]) => void, locked: boolean): View[] {
  const views: View[] = [];
  for (const bubble of toBubbles(items, selfId)) {
    views.push({
      id: bubble.key,
      outgoing: bubble.outgoing,
      createdAt: bubble.createdAt,
      timeLabel: formatClock(bubble.createdAt),
      text: locked ? "Encrypted message" : bubble.plaintext || (bubble.attachment ? undefined : "Encrypted message"),
      attachment: locked ? null : bubble.attachment,
      detail: locked ? "Enter the chat PIN to read this message." : bubble.plaintext || bubble.attachment ? undefined : "This message was locked with the old device key and cannot be opened.",
      receipt: bubble.outgoing ? bubble.status : undefined,
      onDelete: () => onDelete(bubble.ids),
    });
  }
  return views.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}
