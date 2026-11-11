import type { ChatAttachment } from "@/lib/chat-text";
import type { MessageType } from "@/types";

export interface StoredMessage {
  id: string;
  conversationId: string;
  senderUserId: string;
  senderDeviceId: string;
  recipientDeviceId: string;
  ciphertextLength: number;
  messageType: MessageType;
  protocolVersion: string;
  clientMessageId: string;
  createdAt: string;
  expiresAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  plaintext: string | null;
  attachment: ChatAttachment | null;
}

export interface MessagePage {
  messages: StoredMessage[];
  nextCursor: string | null;
}
