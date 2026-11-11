import type { ConversationDto } from "@/types";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function isObjectId(value: string): boolean {
  return /^[a-f\d]{24}$/i.test(value);
}

export function shortId(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

export function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

export function formatListTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return formatClock(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  if (now.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000 && date.getTime() <= now.getTime()) {
    return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
  }
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

export function formatChatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  const formatted = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
  if (date.toDateString() === new Date().toDateString()) return `Today, ${formatted}`;
  return formatted;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function visiblePresence(
  stored: "online" | "offline" | undefined,
  connection: "offline" | "connecting" | "online" | "reconnecting",
  override?: "online" | "offline" | "unknown",
): "online" | "offline" | "unknown" {
  if (override) return override;
  if (stored) return stored;
  return connection === "online" ? "offline" : "unknown";
}

export function otherMembers(conversation: ConversationDto, selfId: string): string[] {
  return conversation.members.filter((member) => member.membershipStatus === "active" && member.userId !== selfId).map((member) => member.userId);
}

export function conversationTitle(conversation: ConversationDto, selfId: string): string {
  if (conversation.conversationType === "group") return "Group conversation";
  const member = conversation.members.find((item) => item.membershipStatus === "active" && item.userId !== selfId);
  if (!member) return "Direct conversation";
  return member.username || `User ${shortId(member.userId)}`;
}

export async function mapPool<T>(items: readonly T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  if (items.length === 0) return;
  let index = 0;
  const run = async (): Promise<void> => {
    const current = index;
    index += 1;
    const item = items[current];
    if (item === undefined) return;
    await worker(item);
    await run();
  };
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.all(workers);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function keyFingerprint(publicKey: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", base64ToBytes(publicKey));
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16)
    .toUpperCase();
  return hex.match(/.{1,4}/g)?.join(" ") ?? hex;
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
