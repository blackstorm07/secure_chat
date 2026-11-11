import { CHAT_PIN_PROTOCOL, createClientMessageId, decodeChatMessage, encodeChatMessage, type ChatAttachment } from "@/lib/chat-text";
import { apiRequest } from "@/services/api";
import { decryptStoredEnvelope, type RecipientDevice } from "@/services/encryption.service";
import type { ConversationDto } from "@/types";
import type { MessageDto } from "@/types";
import type { MessagePage, StoredMessage } from "@/types/message";

export function listConversations(): Promise<{ conversations: ConversationDto[] }> {
  return apiRequest<{ conversations: ConversationDto[] }>("/api/v1/conversations");
}

export function createDirectConversation(
  csrfToken: string,
  participantUserId: string,
): Promise<{ conversation: ConversationDto }> {
  return apiRequest<{ conversation: ConversationDto }>("/api/v1/conversations", {
    method: "POST",
    csrfToken,
    body: { conversationType: "direct", participantUserId },
  });
}

export function getConversation(conversationId: string): Promise<{ conversation: ConversationDto }> {
  return apiRequest<{ conversation: ConversationDto }>(`/api/v1/conversations/${conversationId}`);
}

export async function listMessages(conversationId: string, query?: { cursor?: string; limit?: number }): Promise<MessagePage> {
  const params = new URLSearchParams();
  if (query?.cursor) params.set("cursor", query.cursor);
  if (query?.limit) params.set("limit", String(query.limit));
  const queryString = params.toString();
  const suffix = queryString ? `?${queryString}` : "";
  const page = await apiRequest<{ messages: MessageDto[]; nextCursor: string | null }>(`/api/v1/messages/${conversationId}${suffix}`);
  return {
    messages: await Promise.all(page.messages.map((message) => toStoredMessage(message))),
    nextCursor: page.nextCursor,
  };
}

export async function markDelivered(csrfToken: string, messageId: string): Promise<StoredMessage> {
  const result = await apiRequest<{ message: MessageDto }>(`/api/v1/messages/${messageId}/delivered`, {
    method: "POST",
    csrfToken,
    body: {},
  });
  return toStoredMessage(result.message);
}

export async function markRead(csrfToken: string, messageId: string): Promise<StoredMessage> {
  const result = await apiRequest<{ message: MessageDto }>(`/api/v1/messages/${messageId}/read`, {
    method: "POST",
    csrfToken,
    body: {},
  });
  return toStoredMessage(result.message);
}

export function deleteMessage(csrfToken: string, messageId: string): Promise<Record<string, never>> {
  return apiRequest<Record<string, never>>(`/api/v1/messages/${messageId}`, { method: "DELETE", csrfToken });
}

export async function sendTextMessage(
  csrfToken: string,
  input: {
    conversationId: string;
    senderDeviceId: string;
    recipients: RecipientDevice[];
    text: string;
    file?: ChatAttachment;
    clientMessageId?: string;
  },
): Promise<StoredMessage[]> {
  const envelopes = input.recipients
    .filter((recipient) => recipient.deviceId !== input.senderDeviceId)
    .map((recipient) => ({ recipientDeviceId: recipient.deviceId, ciphertext: encodeChatMessage(input.text, input.file) }));
  if (envelopes.length === 0) throw new Error("This conversation has no device that can receive a message");
  const result = await apiRequest<{ messages: MessageDto[] }>("/api/v1/messages", {
    method: "POST",
    csrfToken,
    body: {
      conversationId: input.conversationId,
      senderDeviceId: input.senderDeviceId,
      clientMessageId: input.clientMessageId ?? createClientMessageId(),
      messageType: "message",
      protocolVersion: CHAT_PIN_PROTOCOL,
      envelopes,
    },
  });
  return Promise.all(result.messages.map((message) => toStoredMessage(message, input.text)));
}

export async function toStoredMessage(message: MessageDto, knownPlaintext?: string): Promise<StoredMessage> {
  const { ciphertext, ...rest } = message;
  const decoded = message.protocolVersion === CHAT_PIN_PROTOCOL ? decodeChatMessage(ciphertext) : null;
  const plaintext =
    knownPlaintext ??
    decoded?.text ??
    (message.protocolVersion === CHAT_PIN_PROTOCOL
      ? null
      : await decryptStoredEnvelope({
          senderDeviceId: message.senderDeviceId,
          recipientDeviceId: message.recipientDeviceId,
          messageType: message.messageType,
          ciphertext,
          clientMessageId: message.clientMessageId,
        }));
  return { ...rest, ciphertextLength: ciphertext.length, plaintext, attachment: decoded?.file ?? null };
}
