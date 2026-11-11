import { AppError } from "@/lib/errors";
import type { ObjectStorage, SignedObjectUrl, StoredObjectHead } from "@/server/services/storage.service";

interface StoredObject {
  size: number;
  mimeType: string;
  uploaded: boolean;
}

export class MemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, StoredObject>();
  expiresIn = 300;

  async createUploadUrl(input: { key: string; size: number; mimeType: string }): Promise<SignedObjectUrl> {
    this.objects.set(input.key, { size: input.size, mimeType: input.mimeType, uploaded: false });
    const signedUrl = this.signed(`https://api.cloudinary.com/v1_1/demo/raw/upload`);
    return {
      ...signedUrl,
      fields: {
        api_key: "test-key",
        timestamp: "1",
        public_id: input.key,
        type: "authenticated",
        signature: "upload",
      },
    };
  }

  async createDownloadUrl(input: { key: string }): Promise<SignedObjectUrl> {
    return this.signed(`https://api.cloudinary.com/v1_1/demo/raw/download?public_id=${encodeURIComponent(input.key)}&signature=download&expires_at=${this.expiresIn}`);
  }

  async head(key: string): Promise<StoredObjectHead | null> {
    const object = this.objects.get(key);
    if (!object?.uploaded) return null;
    return { size: object.size, mimeType: object.mimeType };
  }

  async remove(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async validateUpload(key: string, expectedSize: number, mimeType: string): Promise<void> {
    const head = await this.head(key);
    if (!head) throw new AppError(404, "NOT_FOUND", "Resource not found");
    if (head.size !== expectedSize || head.mimeType !== mimeType) {
      throw new AppError(409, "MEDIA_MISMATCH", "Uploaded object metadata does not match");
    }
  }

  markUploaded(): void {
    for (const object of this.objects.values()) object.uploaded = true;
  }

  private signed(url: string): SignedObjectUrl {
    return { url, expiresIn: this.expiresIn, expiresAt: new Date(Date.now() + this.expiresIn * 1000).toISOString() };
  }
}
