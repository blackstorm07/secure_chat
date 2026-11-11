export const CHAT_PIN_PROTOCOL = "chat-pin-v1";

const TEXT_PREFIX = "CHATPIN1:";
const FILE_MARK = "\u0000file\u0000";

export interface ChatAttachment {
  attachmentId: string;
  name: string;
  mimeType: string;
  size: number;
  key: string;
}

export function createClientMessageId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function encodeChatText(text: string): string {
  return encodePrefixed(text);
}

export function encodeChatMessage(text: string, file?: ChatAttachment): string {
  if (!file) return encodePrefixed(text);
  return encodePrefixed(`${FILE_MARK}${JSON.stringify({ text, file })}`);
}

export function decodeChatText(ciphertext: string): string | null {
  const decoded = decodeChatMessage(ciphertext);
  return decoded?.text ?? null;
}

export function decodeChatMessage(ciphertext: string): { text: string; file: ChatAttachment | null } | null {
  try {
    const binary = atob(ciphertext);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const text = new TextDecoder().decode(bytes);
    if (!text.startsWith(TEXT_PREFIX)) return null;
    const body = text.slice(TEXT_PREFIX.length);
    if (!body.startsWith(FILE_MARK)) return { text: body, file: null };
    const parsed = JSON.parse(body.slice(FILE_MARK.length)) as { text?: unknown; file?: unknown };
    const caption = typeof parsed.text === "string" ? parsed.text : "";
    return { text: caption, file: readAttachment(parsed.file) };
  } catch {
    return null;
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function encodePrefixed(body: string): string {
  const bytes = new TextEncoder().encode(`${TEXT_PREFIX}${body}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function readAttachment(value: unknown): ChatAttachment | null {
  if (!value || typeof value !== "object") return null;
  const file = value as Record<string, unknown>;
  if (typeof file.attachmentId !== "string" || !/^[a-f\d]{24}$/i.test(file.attachmentId)) return null;
  if (typeof file.name !== "string" || file.name.length < 1 || file.name.length > 180) return null;
  if (typeof file.mimeType !== "string" || file.mimeType.length < 1 || file.mimeType.length > 128) return null;
  if (typeof file.size !== "number" || !Number.isInteger(file.size) || file.size < 1) return null;
  if (typeof file.key !== "string" || file.key.length < 8 || file.key.length > 128) return null;
  return { attachmentId: file.attachmentId, name: file.name, mimeType: file.mimeType, size: file.size, key: file.key };
}
