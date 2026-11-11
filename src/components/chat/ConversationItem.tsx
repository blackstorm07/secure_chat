import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

export function ConversationItem({
  href,
  title,
  preview,
  timeLabel,
  unread = 0,
  active = false,
  presence = "unknown",
  image,
  tone,
  onNavigate,
}: {
  href: string;
  title: string;
  preview: string;
  timeLabel: string;
  unread?: number;
  active?: boolean;
  presence?: "online" | "offline" | "unknown";
  image?: string | null;
  tone?: string;
  onNavigate?: (event: { preventDefault: () => void }) => void;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn("flex items-center gap-3 rounded-2xl px-3 py-2.5 transition", active ? "conversation-active" : "hover:bg-[var(--hover)]")}
        onClick={onNavigate}
      >
        <Avatar label={title} image={image} presence={presence} tone={tone} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-semibold">{title}</span>
            <time className="shrink-0 text-[11px] text-[var(--muted)]">{timeLabel}</time>
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className="truncate text-xs text-[var(--muted)]">{preview}</span>
            {unread > 0 ? (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--primary)] px-1.5 text-[11px] font-semibold text-white">{unread}</span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}
