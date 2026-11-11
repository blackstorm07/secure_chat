"use client";

import { Check, CheckCheck } from "lucide-react";
import { MessageMedia } from "@/components/chat/MessageMedia";
import type { ChatAttachment } from "@/lib/chat-text";
import type { StoredMessage } from "@/types/message";
import { cn } from "@/lib/utils";

export interface BubbleModel {
  key: string;
  outgoing: boolean;
  createdAt: string;
  status: "sent" | "delivered" | "read";
  ids: string[];
  plaintext: string | null;
  attachment: ChatAttachment | null;
}

export function toBubbles(items: StoredMessage[], selfId: string | null): BubbleModel[] {
  const groups = new Map<string, StoredMessage[]>();
  for (const item of items) {
    const key = `${item.senderDeviceId}:${item.clientMessageId}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  const bubbles: BubbleModel[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;
    const read = group.every((item) => item.readAt);
    const delivered = group.every((item) => item.deliveredAt || item.readAt);
    bubbles.push({
      key: `${first.senderDeviceId}:${first.clientMessageId}`,
      outgoing: first.senderUserId === selfId,
      createdAt: first.createdAt,
      status: read ? "read" : delivered ? "delivered" : "sent",
      ids: group.map((item) => item.id),
      plaintext: group.find((item) => item.plaintext)?.plaintext ?? null,
      attachment: group.find((item) => item.attachment)?.attachment ?? null,
    });
  }
  return bubbles.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function MessageBubble({
  outgoing,
  timeLabel,
  createdAt,
  text,
  attachment,
  detail,
  receipt,
  onDelete,
}: {
  outgoing: boolean;
  timeLabel: string;
  createdAt: string;
  text?: string;
  attachment?: ChatAttachment | null;
  detail?: string;
  receipt?: "sent" | "delivered" | "read";
  onDelete?: () => void;
}) {
  return (
    <article className={cn("flex", outgoing ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[min(82%,26rem)] rounded-[1.25rem] px-3.5 py-2", outgoing ? "bubble-out rounded-br-md" : "bubble-in rounded-bl-md")}>
        {attachment ? <MessageMedia file={attachment} outgoing={outgoing} /> : null}
        {text ? <p className={cn("text-sm leading-5 whitespace-pre-wrap break-words", attachment ? "mt-2" : "")}>{text}</p> : null}
        {detail ? <p className={cn("mt-1 text-xs leading-5", outgoing ? "text-white/75" : "text-[var(--muted)]")}>{detail}</p> : null}
        <div className={cn("mt-1 flex items-center justify-end gap-1", outgoing ? "text-white/75" : "text-[var(--muted)]")}>
          <time className="text-[11px]" dateTime={createdAt}>
            {timeLabel}
          </time>
          {receipt ? <Receipt status={receipt} /> : null}
          {onDelete ? (
            <button type="button" className="ml-1 text-[10px] underline" onClick={onDelete}>
              Delete
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Receipt({ status }: { status: "sent" | "delivered" | "read" }) {
  if (status === "sent") return <Check className="h-3.5 w-3.5" aria-label="Accepted by the server" />;
  return <CheckCheck className={cn("h-3.5 w-3.5", status === "read" ? "text-white" : "")} aria-label={status === "read" ? "Read" : "Delivered"} />;
}
