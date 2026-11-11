export function TypingIndicator({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;
  return (
    <p className="px-4 py-2 text-sm text-[var(--muted)]" role="status" aria-live="polite">
      {labels.join(", ")} {labels.length === 1 ? "is typing" : "are typing"}
    </p>
  );
}
