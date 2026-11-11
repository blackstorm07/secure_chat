"use client";

import { File, ImageIcon, Paperclip, Video } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { ATTACHMENT_ACCEPT } from "@/types/media";

export function AttachmentMenu({ disabled, onPick, className }: { disabled?: boolean; onPick: (accept: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={root}>
      <IconButton className={className} label={open ? "Close attachment menu" : "Add attachment"} aria-expanded={open} disabled={disabled} onClick={() => setOpen((value) => !value)}>
        <Paperclip className="h-5 w-5" aria-hidden="true" />
      </IconButton>
      {open ? (
        <div role="menu" className="absolute bottom-14 left-0 z-20 w-44 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-1 shadow-[var(--shadow)]">
          <MenuItem icon={<ImageIcon className="h-4 w-4" />} label="Image" onClick={() => { onPick("image/jpeg,image/png,image/webp,image/gif"); setOpen(false); }} />
          <MenuItem icon={<Video className="h-4 w-4" />} label="Video" onClick={() => { onPick("video/mp4,video/webm"); setOpen(false); }} />
          <MenuItem icon={<File className="h-4 w-4" />} label="File" onClick={() => { onPick(ATTACHMENT_ACCEPT); setOpen(false); }} />
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({ label, onClick, icon }: { label: string; onClick: () => void; icon: ReactNode }) {
  return (
    <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--hover)]" onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}
