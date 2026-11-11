"use client";

import { gcm } from "@noble/ciphers/aes.js";
import { ENCRYPTED_MEDIA_MIME_TYPE, MAX_MEDIA_BYTES, MEDIA_CHUNK_BYTES } from "@/server/config/constants";

const MAGIC = [0x53, 0x43, 0x4d, 0x43];
const VERSION = 1;

export interface EncryptedFile {
  body: Blob;
  key: Uint8Array;
  bytes: number;
}

export function isUrlExpired(expiresAt: string, skewMs = 5_000): boolean {
  return Date.parse(expiresAt) - skewMs <= Date.now();
}

/**
 * Encrypts a file in fixed plaintext chunks with AES-256-GCM.
 * The returned key stays with the caller. This module never sends it to the API.
 * This is media encryption only. It is not the Signal Protocol.
 */
export async function encryptFile(file: Blob, chunkBytes = MEDIA_CHUNK_BYTES): Promise<EncryptedFile> {
  if (file.size < 1 || file.size > MAX_MEDIA_BYTES) {
    throw new Error("File size is not allowed");
  }
  const key = crypto.getRandomValues(new Uint8Array(32));
  const framedHeader = header(chunkBytes);
  const parts: BlobPart[] = [toArrayBuffer(framedHeader)];
  let pending = new Uint8Array(0);
  let bytes = framedHeader.byteLength;
  const reader = file.stream().getReader();
  for (;;) {
    const step = await reader.read();
    if (step.done) break;
    pending = concat(pending, step.value);
    while (pending.byteLength >= chunkBytes) {
      const block = copyBytes(pending.subarray(0, chunkBytes));
      pending = copyBytes(pending.subarray(chunkBytes));
      const encrypted = encryptChunk(key, block);
      parts.push(toArrayBuffer(encrypted));
      bytes += encrypted.byteLength;
    }
  }
  if (pending.byteLength > 0) {
    const encrypted = encryptChunk(key, copyBytes(pending));
    parts.push(toArrayBuffer(encrypted));
    bytes += encrypted.byteLength;
  }
  if (bytes > MAX_MEDIA_BYTES) throw new Error("Encrypted file is too large");
  return { body: new Blob(parts, { type: ENCRYPTED_MEDIA_MIME_TYPE }), key, bytes };
}

export async function decryptFile(body: Blob, key: Uint8Array, chunkBytes = MEDIA_CHUNK_BYTES): Promise<Blob> {
  if (key.byteLength !== 32) throw new Error("Encrypted media key is invalid");
  const mediaKey = copyBytes(key);
  const bytes = new Uint8Array(await body.arrayBuffer());
  if (bytes.byteLength < 9 || bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1] || bytes[2] !== MAGIC[2] || bytes[3] !== MAGIC[3]) {
    throw new Error("Encrypted media header is invalid");
  }
  if (bytes[4] !== VERSION) throw new Error("Encrypted media version is unsupported");
  const declared = readUint32(bytes, 5);
  if (declared !== chunkBytes) throw new Error("Encrypted media chunk size does not match");
  const parts: BlobPart[] = [];
  let offset = 9;
  while (offset < bytes.byteLength) {
    if (offset + 16 > bytes.byteLength) throw new Error("Encrypted media chunk is truncated");
    const nonce = bytes.slice(offset, offset + 12);
    const length = readUint32(bytes, offset + 12);
    offset += 16;
    if (length < 16 || offset + length > bytes.byteLength) throw new Error("Encrypted media chunk is truncated");
    const cipher = bytes.slice(offset, offset + length);
    offset += length;
    const plain = gcm(mediaKey, copyBytes(nonce)).decrypt(copyBytes(cipher));
    parts.push(toArrayBuffer(plain));
  }
  return new Blob(parts);
}

export async function putEncryptedObject(
  uploadUrl: string,
  body: Blob,
  fields: Record<string, string>,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (/secret/i.test(key)) throw new Error("Refusing to send storage credentials");
    form.append(key, value);
  }
  form.append("file", body, "ciphertext");
  const total = body.size;
  if (typeof XMLHttpRequest === "undefined") {
    const response = await fetch(uploadUrl, { method: "POST", body: form, signal });
    if (!response.ok) throw Object.assign(new Error("Encrypted upload failed"), { status: response.status });
    onProgress?.(total, total);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    signal?.addEventListener("abort", abort, { once: true });
    request.open("POST", uploadUrl);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded, event.total);
    };
    request.onload = () => {
      signal?.removeEventListener("abort", abort);
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(Object.assign(new Error("Encrypted upload failed"), { status: request.status }));
    };
    request.onerror = () => {
      signal?.removeEventListener("abort", abort);
      reject(new Error("Encrypted upload could not reach Cloudinary."));
    };
    request.onabort = () => {
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("Upload cancelled", "AbortError"));
    };
    request.send(form);
  });
}

interface UploadAuthorization {
  attachmentId: string;
  uploadUrl: string;
  expiresIn: number;
  fields: Record<string, string>;
}

export async function uploadEncryptedAttachment(input: {
  file: Blob;
  conversationId: string;
  csrfToken: string;
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}): Promise<{ attachmentId: string; key: Uint8Array }> {
  throwIfAborted(input.signal);
  const encrypted = await encryptFile(input.file);
  throwIfAborted(input.signal);
  let authorization = await requestUpload(input.conversationId, input.csrfToken, encrypted.bytes, undefined, input.signal);
  try {
    await putEncryptedObject(authorization.uploadUrl, encrypted.body, authorization.fields, input.onProgress, input.signal);
  } catch (error) {
    if (isAbortError(error) || input.signal?.aborted) {
      await discardUpload(input.csrfToken, authorization.attachmentId);
      throw new DOMException("Upload cancelled", "AbortError");
    }
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
    if (status !== 401 && status !== 403) throw error;
    authorization = await requestUpload(input.conversationId, input.csrfToken, encrypted.bytes, authorization.attachmentId, input.signal);
    try {
      await putEncryptedObject(authorization.uploadUrl, encrypted.body, authorization.fields, input.onProgress, input.signal);
    } catch (retryError) {
      if (isAbortError(retryError) || input.signal?.aborted) {
        await discardUpload(input.csrfToken, authorization.attachmentId);
        throw new DOMException("Upload cancelled", "AbortError");
      }
      throw retryError;
    }
  }
  try {
    throwIfAborted(input.signal);
    await confirmUpload(input.csrfToken, authorization.attachmentId);
  } catch (error) {
    if (isAbortError(error) || input.signal?.aborted) {
      await discardUpload(input.csrfToken, authorization.attachmentId);
      throw new DOMException("Upload cancelled", "AbortError");
    }
    throw error;
  }
  return { attachmentId: authorization.attachmentId, key: encrypted.key };
}

export async function downloadEncryptedAttachment(input: {
  attachmentId: string;
  csrfToken: string;
  key: Uint8Array;
}): Promise<Blob> {
  const response = await fetch("/api/v1/media/download-url", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": input.csrfToken },
    body: JSON.stringify({ attachmentId: input.attachmentId }),
  });
  const payload = (await response.json()) as { success?: boolean; data?: { downloadUrl?: string } };
  if (!response.ok || !payload.data?.downloadUrl) throw new Error("Encrypted download was denied");
  const file = await fetch(payload.data.downloadUrl);
  if (!file.ok) throw new Error("Encrypted download failed");
  return decryptFile(await file.blob(), input.key);
}

async function requestUpload(
  conversationId: string,
  csrfToken: string,
  encryptedSize: number,
  attachmentId?: string,
  signal?: AbortSignal,
): Promise<UploadAuthorization> {
  const body = { conversationId, encryptedSize, encryptedMimeType: ENCRYPTED_MEDIA_MIME_TYPE, ...(attachmentId ? { attachmentId } : {}) };
  assertNoKeyMaterial(body);
  const response = await fetch("/api/v1/media/upload-url", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
    body: JSON.stringify(body),
    signal,
  });
  const payload = (await response.json()) as { data?: UploadAuthorization };
  if (!response.ok || !payload.data?.uploadUrl || !payload.data.attachmentId || !payload.data.fields?.signature) {
    throw new Error("Upload authorization failed");
  }
  return payload.data;
}

async function discardUpload(csrfToken: string, attachmentId: string): Promise<void> {
  await fetch(`/api/v1/media/${attachmentId}`, {
    method: "DELETE",
    credentials: "include",
    headers: { "x-csrf-token": csrfToken },
  }).catch(() => undefined);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Upload cancelled", "AbortError");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function confirmUpload(csrfToken: string, attachmentId: string): Promise<void> {
  const response = await fetch("/api/v1/media/confirm-upload", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
    body: JSON.stringify({ attachmentId }),
  });
  if (!response.ok) throw new Error("Upload confirmation failed");
}

function assertNoKeyMaterial(body: Record<string, unknown>): void {
  for (const key of Object.keys(body)) {
    if (/key|nonce|iv|plaintext|secret/i.test(key)) throw new Error("Refusing to send media key material");
  }
}

function encryptChunk(key: Uint8Array, plain: Uint8Array): Uint8Array {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cipher = gcm(copyBytes(key), nonce).encrypt(copyBytes(plain));
  const framed = new Uint8Array(16 + cipher.byteLength);
  framed.set(nonce, 0);
  writeUint32(framed, 12, cipher.byteLength);
  framed.set(cipher, 16);
  return framed;
}

function header(chunkBytes: number): Uint8Array {
  const bytes = new Uint8Array(9);
  bytes.set(MAGIC, 0);
  bytes[4] = VERSION;
  writeUint32(bytes, 5, chunkBytes);
  return bytes;
}

function copyBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return copyBytes(value).buffer;
}

function concat(left: Uint8Array, right: Uint8Array): Uint8Array<ArrayBuffer> {
  const combined = new Uint8Array(left.byteLength + right.byteLength);
  combined.set(left, 0);
  combined.set(right, left.byteLength);
  return combined;
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function readUint32(source: Uint8Array, offset: number): number {
  return ((source[offset] ?? 0) << 24) | ((source[offset + 1] ?? 0) << 16) | ((source[offset + 2] ?? 0) << 8) | (source[offset + 3] ?? 0);
}
