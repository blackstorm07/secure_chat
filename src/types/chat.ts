import type { ConversationDto } from "@/types";

export type { ConversationDto };

export interface ConversationPreview {
  label: string;
  at: string;
}

export type PresenceState = "online" | "offline";
export type ConnectionState = "offline" | "connecting" | "online" | "reconnecting";
