import { downloadEncryptedAttachment, uploadEncryptedAttachment } from "@/lib/encrypted-media";
import { apiRequest } from "@/services/api";

export function uploadCiphertext(input: {
  file: Blob;
  conversationId: string;
  csrfToken: string;
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}): Promise<{ attachmentId: string; key: Uint8Array }> {
  return uploadEncryptedAttachment(input);
}

export function downloadCiphertext(input: { attachmentId: string; csrfToken: string; key: Uint8Array }): Promise<Blob> {
  return downloadEncryptedAttachment(input);
}

export async function deleteAttachment(csrfToken: string, attachmentId: string): Promise<void> {
  await apiRequest<Record<string, never>>(`/api/v1/media/${attachmentId}`, { method: "DELETE", csrfToken });
}
