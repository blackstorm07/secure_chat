"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

export function ConversationSearch({ onSearch }: { onSearch: (value: string) => void }) {
  const [text, setText] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => onSearch(text.trim().toLowerCase()), 200);
    return () => window.clearTimeout(timer);
  }, [onSearch, text]);

  return (
    <label className="relative block">
      <span className="sr-only">Search conversations</span>
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" aria-hidden="true" />
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Search conversations..."
        className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] pr-3 pl-10 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
      />
    </label>
  );
}
