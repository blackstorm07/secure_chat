import { AppError } from "@/lib/errors";
import { connectMongo } from "@/lib/mongodb";
import { DeviceModel } from "@/models/Device";
import { PUBLIC_KEY_MAX_BYTES, PUBLIC_KEY_MIN_BYTES } from "@/server/config/constants";
import { requireOwnedDevice } from "@/server/middleware/authorization";
import { publishRealtime } from "@/server/sockets/bus";
import type { DeviceDto } from "@/types";
import { assertPublicKeyMaterial } from "@/server/utils/key-material";
import { objectId } from "@/server/utils/ids";
import { isDuplicateKey } from "@/server/utils/mongo-errors";

export async function registerDevice(
  userId: string,
  input: { deviceName: string; identityPublicKey: string; registrationId: number },
): Promise<DeviceDto> {
  await connectMongo();
  const identityPublicKey = assertPublicKeyMaterial(
    input.identityPublicKey,
    PUBLIC_KEY_MIN_BYTES,
    PUBLIC_KEY_MAX_BYTES,
    "Identity public key",
  );
  try {
    const device = await DeviceModel.create({
      userId: objectId(userId),
      deviceName: input.deviceName,
      identityPublicKey,
      registrationId: input.registrationId,
      deviceStatus: "active",
      lastActiveAt: new Date(),
    });
    return toDeviceDto(device);
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError(409, "CONFLICT", "Device identity is already registered");
    throw error;
  }
}

export async function listDevices(userId: string): Promise<DeviceDto[]> {
  await connectMongo();
  const devices = await DeviceModel.find({ userId: objectId(userId) }).sort({ createdAt: 1 });
  return devices.map((device) => toDeviceDto(device));
}

export async function revokeDevice(userId: string, deviceId: string): Promise<DeviceDto> {
  await connectMongo();
  const device = await requireOwnedDevice(userId, deviceId, { allowRevoked: true });
  if (device.deviceStatus !== "revoked") {
    device.deviceStatus = "revoked";
    await device.save();
    await publishRealtime({ type: "device:revoked", targetDeviceId: device._id.toString() });
  }
  return toDeviceDto(device);
}

export function toDeviceDto(device: {
  _id: { toString(): string };
  userId: { toString(): string };
  deviceName: string;
  identityPublicKey: string;
  registrationId: number;
  deviceStatus: "active" | "revoked";
  lastActiveAt: Date;
  createdAt: Date;
}): DeviceDto {
  return {
    id: device._id.toString(),
    userId: device.userId.toString(),
    deviceName: device.deviceName,
    identityPublicKey: device.identityPublicKey,
    registrationId: device.registrationId,
    deviceStatus: device.deviceStatus,
    lastActiveAt: device.lastActiveAt.toISOString(),
    createdAt: device.createdAt.toISOString(),
  };
}
