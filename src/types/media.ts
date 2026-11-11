export interface PreparedAttachment {
  attachmentId: string;
  name: string;
  mimeType: string;
  size: number;
  previewUrl: string | null;
}

export const ATTACHMENT_ACCEPT = ".jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.pdf,.txt,.doc,.docx,.xls,.xlsx";
