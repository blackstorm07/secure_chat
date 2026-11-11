import { v2 as cloudinary, type UploadApiOptions } from "cloudinary";
import { AppError } from "@/lib/errors";
import { ENCRYPTED_MEDIA_MIME_TYPE, MAX_MEDIA_BYTES } from "@/server/config/constants";
import { getEnv, type AppEnv } from "@/server/config/env";

export interface StoredObjectHead {
  size: number;
  mimeType: string;
}

export interface SignedObjectUrl {
  url: string;
  expiresAt: string;
  expiresIn: number;
  fields?: Record<string, string>;
}

export interface ObjectStorage {
  createUploadUrl(input: { key: string; size: number; mimeType: string }): Promise<SignedObjectUrl>;
  createDownloadUrl(input: { key: string }): Promise<SignedObjectUrl>;
  head(key: string): Promise<StoredObjectHead | null>;
  remove(key: string): Promise<void>;
  validateUpload(key: string, expectedSize: number, mimeType: string): Promise<void>;
}

export interface CloudinarySettings {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  expiresIn: number;
}

const AUTHENTICATED = "authenticated";

export function cloudinarySettings(env: AppEnv = getEnv()): CloudinarySettings | null {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) return null;
  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    apiSecret: env.CLOUDINARY_API_SECRET,
    expiresIn: env.CLOUDINARY_URL_EXPIRY,
  };
}

export function buildSignedUpload(settings: CloudinarySettings, key: string, now = Date.now()): SignedObjectUrl {
  const timestamp = Math.round(now / 1000);
  const params = { public_id: key, timestamp, type: AUTHENTICATED };
  configure(settings);
  const signature = cloudinary.utils.api_sign_request(params, settings.apiSecret);
  const fields = {
    api_key: settings.apiKey,
    timestamp: String(timestamp),
    public_id: key,
    type: AUTHENTICATED,
    signature,
  };
  const url = `https://api.cloudinary.com/v1_1/${settings.cloudName}/raw/upload`;
  assertNoSecret(url, fields, settings.apiSecret);
  return signed(url, settings.expiresIn, now, fields);
}

export function buildSignedDownload(settings: CloudinarySettings, key: string, now = Date.now()): SignedObjectUrl {
  configure(settings);
  const expiresAt = Math.round(now / 1000) + settings.expiresIn;
  const url = cloudinary.utils.private_download_url(key, "", {
    resource_type: "raw",
    type: AUTHENTICATED,
    expires_at: expiresAt,
  });
  assertNoSecret(url, {}, settings.apiSecret);
  if (!url.startsWith(`https://api.cloudinary.com/v1_1/${settings.cloudName}/raw/download`)) {
    throw new AppError(503, "STORAGE_UNAVAILABLE", "Object storage is unavailable");
  }
  if (!url.includes("type=authenticated") || !url.includes("expires_at=")) {
    throw new AppError(503, "STORAGE_UNAVAILABLE", "Object storage is unavailable");
  }
  return { url, expiresIn: settings.expiresIn, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

function requireSettings(): CloudinarySettings {
  const settings = cloudinarySettings();
  if (!settings) throw new AppError(503, "STORAGE_UNAVAILABLE", "Object storage is not configured");
  return settings;
}

export async function validateUpload(key: string, expectedSize: number, mimeType: string): Promise<void> {
  await assertStoredObject(key, expectedSize, mimeType);
}

async function assertStoredObject(key: string, expectedSize: number, mimeType: string): Promise<void> {
  if (expectedSize < 1 || expectedSize > MAX_MEDIA_BYTES) {
    throw new AppError(400, "VALIDATION_ERROR", "Encrypted object size is not allowed");
  }
  const head = await headObject(key);
  if (!head) throw new AppError(404, "NOT_FOUND", "Resource not found");
  if (head.size !== expectedSize || head.size > MAX_MEDIA_BYTES || head.mimeType !== mimeType) {
    throw new AppError(409, "MEDIA_MISMATCH", "Uploaded object metadata does not match");
  }
}

async function headObject(key: string): Promise<StoredObjectHead | null> {
  const settings = requireSettings();
  configure(settings);
  try {
    const result = await cloudinary.api.resource(key, { resource_type: "raw", type: AUTHENTICATED });
    const size = typeof result.bytes === "number" ? result.bytes : 0;
    const mimeType = result.resource_type === "raw" ? ENCRYPTED_MEDIA_MIME_TYPE : "";
    return { size, mimeType };
  } catch (error) {
    if (isMissingObject(error)) return null;
    throw new AppError(503, "STORAGE_UNAVAILABLE", "Object storage is unavailable");
  }
}

async function removeObject(key: string): Promise<void> {
  const settings = requireSettings();
  configure(settings);
  try {
    const options: UploadApiOptions = { resource_type: "raw", type: AUTHENTICATED, invalidate: true };
    await cloudinary.uploader.destroy(key, options);
  } catch (error) {
    if (isMissingObject(error)) return;
    throw new AppError(503, "STORAGE_UNAVAILABLE", "Object storage is unavailable");
  }
}

class CloudinaryObjectStorage implements ObjectStorage {
  async createUploadUrl(input: { key: string; size: number; mimeType: string }): Promise<SignedObjectUrl> {
    return buildSignedUpload(requireSettings(), input.key);
  }

  async createDownloadUrl(input: { key: string }): Promise<SignedObjectUrl> {
    return buildSignedDownload(requireSettings(), input.key);
  }

  async head(key: string): Promise<StoredObjectHead | null> {
    return headObject(key);
  }

  async remove(key: string): Promise<void> {
    await removeObject(key);
  }

  async validateUpload(key: string, expectedSize: number, mimeType: string): Promise<void> {
    await assertStoredObject(key, expectedSize, mimeType);
  }
}

function configure(settings: CloudinarySettings): void {
  cloudinary.config({
    cloud_name: settings.cloudName,
    api_key: settings.apiKey,
    api_secret: settings.apiSecret,
    secure: true,
  });
}

function signed(url: string, expiresIn: number, now: number, fields: Record<string, string>): SignedObjectUrl {
  return { url, expiresIn, expiresAt: new Date(now + expiresIn * 1000).toISOString(), fields };
}

function assertNoSecret(url: string, fields: Record<string, string>, apiSecret: string): void {
  const serialized = `${url} ${JSON.stringify(fields)}`;
  if (serialized.includes(apiSecret) || url.includes("res.cloudinary.com") && url.includes("/upload/")) {
    throw new AppError(503, "STORAGE_UNAVAILABLE", "Object storage is unavailable");
  }
}

function isMissingObject(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as { http_code?: unknown; error?: { http_code?: unknown; message?: unknown } };
  const status = Number(record.http_code ?? record.error?.http_code ?? 0);
  if (status === 404) return true;
  const message = typeof record.error?.message === "string" ? record.error.message : "";
  return /not found/i.test(message);
}

let storage: ObjectStorage = new CloudinaryObjectStorage();

export function setObjectStorageForTests(next: ObjectStorage): void {
  storage = next;
}

export function resetObjectStorageForTests(): void {
  storage = new CloudinaryObjectStorage();
}

export function getObjectStorage(): ObjectStorage {
  return storage;
}

export function encryptedMediaType(): string {
  return ENCRYPTED_MEDIA_MIME_TYPE;
}
