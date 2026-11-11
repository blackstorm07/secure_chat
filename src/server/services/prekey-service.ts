import { AppError } from "@/lib/errors";
import { connectMongo } from "@/lib/mongodb";
import { DeviceModel } from "@/models/Device";
import { PreKeyModel } from "@/models/PreKey";
import {
  KEY_CONSUME_LIMIT,
  KEY_READ_WINDOW_MS,
  KEY_READ_LIMIT,
  PUBLIC_KEY_MAX_BYTES,
  PUBLIC_KEY_MIN_BYTES,
  SIGNATURE_MAX_BYTES,
  SIGNATURE_MIN_BYTES,
} from "@/server/config/constants";
import { assertRateLimit } from "@/server/middleware/rate-limit";
import { requireOwnedDevice } from "@/server/middleware/authorization";
import { getSignedPreKeyVerifier } from "@/server/services/protocol-adapter";
import { assertPublicKeyMaterial } from "@/server/utils/key-material";
import { objectId } from "@/server/utils/ids";

interface OneTimeKeyInput {
  keyId: number;
  publicKey: string;
}

export async function uploadPreKeys(
  userId: string,
  input: {
    deviceId: string;
    signedPreKeyId: number;
    signedPreKeyPublic: string;
    signedPreKeySignature: string;
    oneTimePreKeys: OneTimeKeyInput[];
  },
) {
  await connectMongo();
  const device = await requireOwnedDevice(userId, input.deviceId);
  const identityPublicKey = device.identityPublicKey;
  const signedPreKeyPublic = assertPublicKeyMaterial(
    input.signedPreKeyPublic,
    PUBLIC_KEY_MIN_BYTES,
    PUBLIC_KEY_MAX_BYTES,
    "Signed prekey",
  );
  const signedPreKeySignature = assertPublicKeyMaterial(
    input.signedPreKeySignature,
    SIGNATURE_MIN_BYTES,
    SIGNATURE_MAX_BYTES,
    "Signed prekey signature",
  );
  const oneTimePreKeys = input.oneTimePreKeys.map((item) => ({
    keyId: item.keyId,
    publicKey: assertPublicKeyMaterial(item.publicKey, PUBLIC_KEY_MIN_BYTES, PUBLIC_KEY_MAX_BYTES, "One-time prekey"),
    consumedAt: null,
  }));
  const verification = await getSignedPreKeyVerifier().verify({
    identityPublicKey,
    signedPreKeyPublic,
    signedPreKeySignature,
  });
  if (!verification.accepted) {
    throw new AppError(400, "VALIDATION_ERROR", "Signed prekey was rejected");
  }
  const bundle = await PreKeyModel.findOneAndUpdate(
    { deviceId: device._id },
    {
      $set: {
        signedPreKeyId: input.signedPreKeyId,
        signedPreKeyPublic,
        signedPreKeySignature,
        signatureVerification: verification.cryptographicallyVerified ? "verified" : "structural-only",
        oneTimePreKeys,
      },
    },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
  );
  if (!bundle) throw new AppError(500, "INTERNAL_ERROR", "Something went wrong");
  return {
    deviceId: device._id.toString(),
    signedPreKeyId: bundle.signedPreKeyId,
    oneTimePreKeyCount: bundle.oneTimePreKeys.length,
    cryptographicallyVerified: verification.cryptographicallyVerified,
  };
}

export async function getKeyBundle(callerId: string, userId: string, deviceId: string) {
  await assertRateLimit(`keys:read:${callerId}`, KEY_READ_LIMIT, KEY_READ_WINDOW_MS);
  await connectMongo();
  const device = await DeviceModel.findOne({ _id: objectId(deviceId), userId: objectId(userId), deviceStatus: "active" });
  if (!device) throw new AppError(404, "NOT_FOUND", "Resource not found");
  const bundle = await PreKeyModel.findOne({ deviceId: device._id });
  if (!bundle) throw new AppError(404, "NOT_FOUND", "Resource not found");
  const available = bundle.oneTimePreKeys.filter((item) => item.consumedAt == null).length;
  return {
    userId: device.userId.toString(),
    deviceId: device._id.toString(),
    registrationId: device.registrationId,
    identityPublicKey: device.identityPublicKey,
    signedPreKeyId: bundle.signedPreKeyId,
    signedPreKeyPublic: bundle.signedPreKeyPublic,
    signedPreKeySignature: bundle.signedPreKeySignature,
    oneTimePreKeyCount: available,
    cryptographicallyVerified: bundle.signatureVerification === "verified",
  };
}

export async function consumeOneTimePreKey(callerId: string, userId: string, deviceId: string, keyId?: number) {
  await assertRateLimit(`keys:consume:${callerId}`, KEY_CONSUME_LIMIT, KEY_READ_WINDOW_MS);
  await connectMongo();
  const device = await DeviceModel.findOne({ _id: objectId(deviceId), userId: objectId(userId), deviceStatus: "active" });
  if (!device) throw new AppError(404, "NOT_FOUND", "Resource not found");
  const targetId = keyId ?? (await nextAvailableKeyId(device._id.toString()));
  const bundle = await PreKeyModel.findOne({ deviceId: device._id });
  if (!bundle) throw new AppError(404, "NOT_FOUND", "Resource not found");
  const existing = bundle.oneTimePreKeys.find((item) => item.keyId === targetId);
  if (!existing) throw new AppError(404, "NOT_FOUND", "Resource not found");
  if (existing.consumedAt) throw new AppError(409, "PREKEY_CONSUMED", "One-time prekey was already consumed");

  const updated = await PreKeyModel.findOneAndUpdate(
    {
      deviceId: device._id,
      oneTimePreKeys: { $elemMatch: { keyId: targetId, consumedAt: null } },
    },
    { $set: { "oneTimePreKeys.$.consumedAt": new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) throw new AppError(409, "PREKEY_CONSUMED", "One-time prekey was already consumed");
  const consumed = updated.oneTimePreKeys.find((item) => item.keyId === targetId);
  if (!consumed?.consumedAt) throw new AppError(409, "PREKEY_CONSUMED", "One-time prekey was already consumed");
  return {
    userId: device.userId.toString(),
    deviceId: device._id.toString(),
    keyId: consumed.keyId,
    publicKey: consumed.publicKey,
  };
}

async function nextAvailableKeyId(deviceId: string): Promise<number> {
  const bundle = await PreKeyModel.findOne({
    deviceId: objectId(deviceId),
    oneTimePreKeys: { $elemMatch: { consumedAt: null } },
  });
  const available = bundle?.oneTimePreKeys.find((item) => item.consumedAt == null);
  if (!available) throw new AppError(404, "NOT_FOUND", "Resource not found");
  return available.keyId;
}
