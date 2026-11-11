import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { AttachmentModel } from "@/models/Attachment";
import { ENCRYPTED_MEDIA_MIME_TYPE, MAX_MEDIA_BYTES, MEDIA_CHUNK_BYTES } from "@/server/config/constants";
import { buildSignedDownload, buildSignedUpload, resetObjectStorageForTests, type CloudinarySettings } from "@/server/services/storage.service";
import { decryptFile, encryptFile, isUrlExpired } from "@/lib/encrypted-media";
import { authHeaders, registerAccount } from "./support/account";
import { resetDatabase } from "./support/db";
import { createApiServer } from "./support/http";
import { MemoryObjectStorage } from "./support/memory-storage";

const api = request(createApiServer());
const storage = new MemoryObjectStorage();

beforeEach(async () => {
  await resetDatabase();
  storage.objects.clear();
  storage.expiresIn = 300;
  const { setObjectStorageForTests } = await import("@/server/services/storage.service");
  setObjectStorageForTests(storage);
});

describe("Cloudinary media access", () => {
  it("signs a private Cloudinary upload and rejects a missing configuration", async () => {
    const settings: CloudinarySettings = {
      cloudName: "demo",
      apiKey: "123456789012345",
      apiSecret: "cloudinary-api-secret",
      expiresIn: 300,
    };
    const upload = buildSignedUpload(settings, "m/object", 1_700_000_000_000);
    expect(upload.url).toBe("https://api.cloudinary.com/v1_1/demo/raw/upload");
    expect(upload.fields?.type).toBe("authenticated");
    expect(upload.fields?.public_id).toBe("m/object");
    expect(upload.fields?.api_key).toBe(settings.apiKey);
    expect(upload.fields).not.toHaveProperty("api_secret");
    expect(JSON.stringify(upload)).not.toContain(settings.apiSecret);
    const download = buildSignedDownload(settings, "m/object", 1_700_000_000_000);
    expect(download.url).toContain("https://api.cloudinary.com/v1_1/demo/raw/download");
    expect(download.url).toContain("type=authenticated");
    expect(download.url).not.toContain(settings.apiSecret);
    expect(download.expiresIn).toBe(300);

    resetObjectStorageForTests();
    const ada = await registerAccount(api, "ada", "ada@example.com");
    const grace = await registerAccount(api, "grace", "grace@example.com");
    const conversation = await api.post("/api/v1/conversations").set(authHeaders(ada.cookie, ada.csrf)).send({
      conversationType: "direct",
      participantUserId: grace.userId,
    });
    const missing = await api.post("/api/v1/media/upload-url").set(authHeaders(ada.cookie, ada.csrf)).send({
      conversationId: conversation.body.data.conversation.id,
      encryptedSize: 128,
      encryptedMimeType: ENCRYPTED_MEDIA_MIME_TYPE,
    });
    expect(missing.status).toBe(503);
    expect(missing.body.errorCode).toBe("STORAGE_UNAVAILABLE");
    expect(JSON.stringify(missing.body)).not.toContain("secret");
  });

  it("authorizes ciphertext upload, confirmation, download, and deletion", async () => {
    const { ada, grace, bob, conversationId } = await members();
    const anonymous = await api.post("/api/v1/media/upload-url").send({
      conversationId,
      encryptedSize: 128,
      encryptedMimeType: ENCRYPTED_MEDIA_MIME_TYPE,
    });
    expect(anonymous.status).toBe(401);

    const invalidType = await api.post("/api/v1/media/upload-url").set(authHeaders(ada.cookie, ada.csrf)).send({
      conversationId,
      encryptedSize: 128,
      encryptedMimeType: "image/jpeg",
    });
    expect(invalidType.status).toBe(400);
    const tooLarge = await api.post("/api/v1/media/upload-url").set(authHeaders(ada.cookie, ada.csrf)).send({
      conversationId,
      encryptedSize: MAX_MEDIA_BYTES + 1,
      encryptedMimeType: ENCRYPTED_MEDIA_MIME_TYPE,
    });
    expect(tooLarge.status).toBe(400);
    const withKey = await api.post("/api/v1/media/upload-url").set(authHeaders(ada.cookie, ada.csrf)).send({
      conversationId,
      encryptedSize: 128,
      encryptedMimeType: ENCRYPTED_MEDIA_MIME_TYPE,
      encryptionKey: "should-never-be-stored",
    });
    expect(withKey.status).toBe(400);
    expect(await AttachmentModel.countDocuments()).toBe(0);

    const upload = await api.post("/api/v1/media/upload-url").set(authHeaders(ada.cookie, ada.csrf)).send({
      conversationId,
      encryptedSize: 128,
      encryptedMimeType: ENCRYPTED_MEDIA_MIME_TYPE,
    });
    expect(upload.status).toBe(201);
    expect(upload.body.data.objectKey).toMatch(/^m\/[A-Za-z0-9_-]+$/);
    expect(upload.body.data.objectKey).not.toContain(conversationId);
    expect(upload.body.data.expiresIn).toBe(300);
    expect(upload.body.data.uploadUrl).toBe("https://api.cloudinary.com/v1_1/demo/raw/upload");
    expect(upload.body.data.fields.signature).toBe("upload");
    expect(upload.body.data.fields.type).toBe("authenticated");
    expect(upload.body.data.fields).not.toHaveProperty("api_secret");
    expect(isUrlExpired(new Date(Date.now() + upload.body.data.expiresIn * 1000).toISOString())).toBe(false);
    expect(isUrlExpired(new Date(Date.now() - 1000).toISOString())).toBe(true);

    const attachmentId = upload.body.data.attachmentId as string;
    const earlyDownload = await api.post("/api/v1/media/download-url").set(authHeaders(ada.cookie, ada.csrf)).send({ attachmentId });
    expect(earlyDownload.status).toBe(409);

    storage.markUploaded();
    for (const object of storage.objects.values()) object.size = 5;
    const mismatch = await api.post("/api/v1/media/confirm-upload").set(authHeaders(ada.cookie, ada.csrf)).send({ attachmentId });
    expect(mismatch.status).toBe(409);
    for (const object of storage.objects.values()) object.size = 128;

    const outsiderConfirm = await api.post("/api/v1/media/confirm-upload").set(authHeaders(bob.cookie, bob.csrf)).send({ attachmentId });
    expect(outsiderConfirm.status).toBe(404);
    const confirmed = await api.post("/api/v1/media/confirm-upload").set(authHeaders(ada.cookie, ada.csrf)).send({ attachmentId });
    expect(confirmed.status).toBe(200);
    const stored = await AttachmentModel.findById(attachmentId).lean();
    expect(stored?.status).toBe("ready");
    expect(stored).not.toHaveProperty("encryptionKey");
    expect(JSON.stringify(stored)).not.toContain("should-never-be-stored");

    const denied = await api.post("/api/v1/media/download-url").set(authHeaders(bob.cookie, bob.csrf)).send({ attachmentId });
    expect(denied.status).toBe(404);
    expect(JSON.stringify(denied.body)).not.toContain("api.cloudinary.com");
    const allowed = await api.post("/api/v1/media/download-url").set(authHeaders(grace.cookie, grace.csrf)).send({ attachmentId });
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.expiresIn).toBe(300);
    expect(allowed.body.data.downloadUrl).toContain("expires_at=300");

    const graceDelete = await api.delete(`/api/v1/media/${attachmentId}`).set(authHeaders(grace.cookie, grace.csrf));
    expect(graceDelete.status).toBe(404);
    const removed = await api.delete(`/api/v1/media/${attachmentId}`).set(authHeaders(ada.cookie, ada.csrf));
    expect(removed.status).toBe(200);
    expect(await AttachmentModel.countDocuments()).toBe(0);
    const afterDelete = await api.post("/api/v1/media/download-url").set(authHeaders(grace.cookie, grace.csrf)).send({ attachmentId });
    expect(afterDelete.status).toBe(404);
  });

  it("round-trips a chunked AES-GCM file without putting the key in the ciphertext", async () => {
    const marker = "plaintext-marker-do-not-store";
    const encrypted = await encryptFile(new Blob([marker.repeat(1000)]));
    const encoded = new TextDecoder().decode(await encrypted.body.arrayBuffer());
    expect(encoded).not.toContain(marker);
    expect(Buffer.from(encrypted.key).toString("base64")).not.toBe("");
    const plain = await decryptFile(encrypted.body, encrypted.key);
    expect(await plain.text()).toBe(marker.repeat(1000));
  });

  it("decrypts an image that was sealed with Web Crypto", async () => {
    const marker = "webcrypto-plaintext";
    const key = crypto.getRandomValues(new Uint8Array(32));
    const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]);
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cryptoKey, new TextEncoder().encode(marker)));
    const framed = new Uint8Array(9 + 16 + cipher.byteLength);
    framed.set([0x53, 0x43, 0x4d, 0x43, 1], 0);
    framed[5] = (MEDIA_CHUNK_BYTES >>> 24) & 0xff;
    framed[6] = (MEDIA_CHUNK_BYTES >>> 16) & 0xff;
    framed[7] = (MEDIA_CHUNK_BYTES >>> 8) & 0xff;
    framed[8] = MEDIA_CHUNK_BYTES & 0xff;
    framed.set(nonce, 9);
    framed[21] = (cipher.byteLength >>> 24) & 0xff;
    framed[22] = (cipher.byteLength >>> 16) & 0xff;
    framed[23] = (cipher.byteLength >>> 8) & 0xff;
    framed[24] = cipher.byteLength & 0xff;
    framed.set(cipher, 25);
    const plain = await decryptFile(new Blob([framed]), key);
    expect(await plain.text()).toBe(marker);
  });
});

async function members() {
  const ada = await registerAccount(api, "ada", "ada@example.com");
  const grace = await registerAccount(api, "grace", "grace@example.com");
  const bob = await registerAccount(api, "bob", "bob@example.com");
  const conversation = await api.post("/api/v1/conversations").set(authHeaders(ada.cookie, ada.csrf)).send({
    conversationType: "direct",
    participantUserId: grace.userId,
  });
  return { ada, grace, bob, conversationId: conversation.body.data.conversation.id as string };
}

