import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { DeviceModel } from "@/models/Device";
import { MessageModel } from "@/models/Message";
import { PreKeyModel } from "@/models/PreKey";
import { authHeaders, publicKey, registerAccount, signature } from "./support/account";
import { resetDatabase } from "./support/db";
import { createApiServer } from "./support/http";

const api = request(createApiServer());

beforeEach(resetDatabase);

async function registerDevice(cookie: string, csrf: string, name: string) {
  const response = await api.post("/api/v1/devices").set(authHeaders(cookie, csrf)).send({
    deviceName: name,
    identityPublicKey: publicKey(),
    registrationId: 1000 + name.length,
  });
  expect(response.status).toBe(201);
  return response.body.data.device as { id: string; identityPublicKey: string; deviceStatus: string };
}

describe("devices, prekeys, conversations, and messages", () => {
  it("registers and revokes a device, then refuses future delivery to it", async () => {
    const ada = await registerAccount(api, "ada", "ada@example.com");
    const grace = await registerAccount(api, "grace", "grace@example.com");
    const adaDevice = await registerDevice(ada.cookie, ada.csrf, "laptop");
    const graceDevice = await registerDevice(grace.cookie, grace.csrf, "phone");
    const revoked = await api.post(`/api/v1/devices/${graceDevice.id}/revoke`).set(authHeaders(grace.cookie, grace.csrf));
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.device.deviceStatus).toBe("revoked");

    const conversation = await api.post("/api/v1/conversations").set(authHeaders(ada.cookie, ada.csrf)).send({
      conversationType: "direct",
      participantUserId: grace.userId,
    });
    expect(conversation.status).toBe(201);
    const conversationId = conversation.body.data.conversation.id as string;
    const outsider = await api.get(`/api/v1/conversations/${conversationId}`);
    expect(outsider.status).toBe(401);
    const hidden = await api.get(`/api/v1/conversations/${conversationId}`).set("Cookie", (await registerAccount(api, "bob", "bob@example.com")).cookie);
    expect(hidden.status).toBe(404);

    const message = await api.post("/api/v1/messages").set(authHeaders(ada.cookie, ada.csrf)).send({
      conversationId,
      senderDeviceId: adaDevice.id,
      clientMessageId: "client-message-1",
      messageType: "message",
      protocolVersion: "opaque-1",
      envelopes: [{ recipientDeviceId: graceDevice.id, ciphertext: publicKey() }],
    });
    expect(message.status).toBe(400);
    expect(await MessageModel.countDocuments()).toBe(0);
    const storedDevice = await DeviceModel.findById(graceDevice.id);
    expect(storedDevice?.deviceStatus).toBe("revoked");
    expect(storedDevice?.toObject()).not.toHaveProperty("identityPrivateKey");
  });

  it("consumes a one-time prekey once", async () => {
    const ada = await registerAccount(api, "ada", "ada@example.com");
    const device = await registerDevice(ada.cookie, ada.csrf, "laptop");
    const oneTime = publicKey();
    const upload = await api.post("/api/v1/keys/upload").set(authHeaders(ada.cookie, ada.csrf)).send({
      deviceId: device.id,
      signedPreKeyId: 7,
      signedPreKeyPublic: publicKey(),
      signedPreKeySignature: signature(),
      oneTimePreKeys: [{ keyId: 11, publicKey: oneTime }],
    });
    expect(upload.status).toBe(200);
    expect(upload.body.data.bundle.cryptographicallyVerified).toBe(false);
    expect(upload.body.data.bundle.signedPreKeyPublic).toBeUndefined();

    const bundle = await api.get(`/api/v1/keys/${ada.userId}/${device.id}`).set("Cookie", ada.cookie);
    expect(bundle.status).toBe(200);
    expect(bundle.body.data.bundle.oneTimePreKeyCount).toBe(1);
    expect(bundle.body.data.bundle.cryptographicallyVerified).toBe(false);
    expect(JSON.stringify(bundle.body)).not.toContain("PRIVATE KEY");

    const first = await api.post("/api/v1/keys/consume").set(authHeaders(ada.cookie, ada.csrf)).send({
      userId: ada.userId,
      deviceId: device.id,
      keyId: 11,
    });
    expect(first.status).toBe(200);
    expect(first.body.data.preKey.publicKey).toBe(oneTime);
    const second = await api.post("/api/v1/keys/consume").set(authHeaders(ada.cookie, ada.csrf)).send({
      userId: ada.userId,
      deviceId: device.id,
      keyId: 11,
    });
    expect(second.status).toBe(409);
    expect(second.body.errorCode).toBe("PREKEY_CONSUMED");
    expect(second.body.data).toBeUndefined();
    const stored = await PreKeyModel.findOne({ deviceId: device.id });
    expect(stored?.oneTimePreKeys.filter((item) => item.consumedAt)).toHaveLength(1);
  });

  it("stores opaque ciphertext and blocks unauthorized reads and deletes", async () => {
    const ada = await registerAccount(api, "ada", "ada@example.com");
    const grace = await registerAccount(api, "grace", "grace@example.com");
    const bob = await registerAccount(api, "bob", "bob@example.com");
    const adaDevice = await registerDevice(ada.cookie, ada.csrf, "laptop");
    const graceDevice = await registerDevice(grace.cookie, grace.csrf, "phone");
    const conversation = await api.post("/api/v1/conversations").set(authHeaders(ada.cookie, ada.csrf)).send({
      conversationType: "direct",
      participantUserId: grace.userId,
    });
    const conversationId = conversation.body.data.conversation.id as string;
    const ciphertext = publicKey();
    const rejected = await api.post("/api/v1/messages").set(authHeaders(ada.cookie, ada.csrf)).send({
      conversationId,
      senderDeviceId: adaDevice.id,
      clientMessageId: "client-message-2",
      messageType: "message",
      protocolVersion: "opaque-1",
      plaintext: "hello from plaintext",
      envelopes: [{ recipientDeviceId: graceDevice.id, ciphertext }],
    });
    expect(rejected.status).toBe(400);
    expect(await MessageModel.countDocuments()).toBe(0);

    const created = await api.post("/api/v1/messages").set(authHeaders(ada.cookie, ada.csrf)).send({
      conversationId,
      senderDeviceId: adaDevice.id,
      clientMessageId: "client-message-2",
      messageType: "message",
      protocolVersion: "opaque-1",
      envelopes: [{ recipientDeviceId: graceDevice.id, ciphertext }],
    });
    expect(created.status).toBe(201);
    const messageId = created.body.data.messages[0].id as string;
    expect(created.body.data.messages[0].ciphertext).toBe(ciphertext);
    const duplicate = await api.post("/api/v1/messages").set(authHeaders(ada.cookie, ada.csrf)).send({
      conversationId,
      senderDeviceId: adaDevice.id,
      clientMessageId: "client-message-2",
      messageType: "message",
      protocolVersion: "opaque-1",
      envelopes: [{ recipientDeviceId: graceDevice.id, ciphertext }],
    });
    expect(duplicate.status).toBe(200);
    expect(await MessageModel.countDocuments()).toBe(1);
    const stored = await MessageModel.findById(messageId).lean();
    expect(stored?.ciphertext).toBe(ciphertext);
    expect(stored).not.toHaveProperty("plaintext");
    expect(JSON.stringify(stored)).not.toContain("hello from plaintext");

    const hidden = await api.get(`/api/v1/messages/${conversationId}`).set("Cookie", bob.cookie);
    expect(hidden.status).toBe(404);
    expect(JSON.stringify(hidden.body)).not.toContain(ciphertext);
    const visible = await api.get(`/api/v1/messages/${conversationId}`).set("Cookie", grace.cookie);
    expect(visible.status).toBe(200);
    expect(visible.body.data.messages).toHaveLength(1);

    const senderReceipt = await api.post(`/api/v1/messages/${messageId}/delivered`).set(authHeaders(ada.cookie, ada.csrf));
    expect(senderReceipt.status).toBe(404);
    const receipt = await api.post(`/api/v1/messages/${messageId}/delivered`).set(authHeaders(grace.cookie, grace.csrf));
    expect(receipt.status).toBe(200);
    expect(receipt.body.data.message.deliveredAt).toBeTruthy();

    const forbiddenDelete = await api.delete(`/api/v1/messages/${messageId}`).set(authHeaders(bob.cookie, bob.csrf));
    expect(forbiddenDelete.status).toBe(404);
    expect(await MessageModel.countDocuments()).toBe(1);
    const deleted = await api.delete(`/api/v1/messages/${messageId}`).set(authHeaders(grace.cookie, grace.csrf));
    expect(deleted.status).toBe(200);
    expect(await MessageModel.countDocuments()).toBe(0);
  });

  it("rejects private key material", async () => {
    const ada = await registerAccount(api, "ada", "ada@example.com");
    const response = await api.post("/api/v1/devices").set(authHeaders(ada.cookie, ada.csrf)).send({
      deviceName: "laptop",
      identityPublicKey: "-----BEGIN PRIVATE KEY-----\nMIIEsecret\n-----END PRIVATE KEY-----",
      registrationId: 42,
    });
    expect(response.status).toBe(400);
    expect(await DeviceModel.countDocuments()).toBe(0);
  });
});
