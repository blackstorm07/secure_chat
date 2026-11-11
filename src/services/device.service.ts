import { loadDeviceIdentity, clearDeviceIdentity } from "@/lib/device-keystore";
import { withSignal } from "@/lib/signal-keystore";
import { apiRequest } from "@/services/api";
import { createLocalSignalAccount, publishLocalPreKeys } from "@/services/encryption.service";
import type { DeviceRecord } from "@/types/auth";

export function listDevices(): Promise<{ devices: DeviceRecord[] }> {
  return apiRequest<{ devices: DeviceRecord[] }>("/api/v1/devices");
}

export function registerDevice(
  csrfToken: string,
  input: { deviceName: string; identityPublicKey: string; registrationId: number },
): Promise<{ device: DeviceRecord }> {
  return apiRequest<{ device: DeviceRecord }>("/api/v1/devices", { method: "POST", csrfToken, body: input });
}

export function revokeDevice(csrfToken: string, deviceId: string): Promise<{ device: DeviceRecord }> {
  return apiRequest<{ device: DeviceRecord }>(`/api/v1/devices/${deviceId}/revoke`, { method: "POST", csrfToken, body: {} });
}

export interface ActiveDevice {
  deviceId: string;
  publicKey: string;
  registrationId: number;
}

let pendingDevice: Promise<ActiveDevice> | null = null;

export function ensureLocalDevice(csrfToken: string): Promise<ActiveDevice> {
  pendingDevice ??= ensureLocalDeviceOnce(csrfToken).finally(() => {
    pendingDevice = null;
  });
  return pendingDevice;
}

async function ensureLocalDeviceOnce(csrfToken: string): Promise<ActiveDevice> {
  return withSignal(async (vault) => {
    const devices = await listDevices();
    const currentId = vault.store.deviceId;
    if (currentId) {
      const match = devices.devices.find((device) => device.id === currentId && device.deviceStatus === "active");
      if (match) {
        await publishLocalPreKeys(csrfToken, vault.store);
        await vault.persist();
        return { deviceId: match.id, publicKey: match.identityPublicKey, registrationId: match.registrationId };
      }
      vault.store.reset();
      await vault.persist();
    }

    const legacy = await loadDeviceIdentity().catch(() => null);
    if (legacy) {
      await revokeDevice(csrfToken, legacy.deviceId).catch(() => undefined);
      await clearDeviceIdentity();
    }

    const identity = await createLocalSignalAccount(vault.store);
    let created: { device: DeviceRecord };
    try {
      created = await registerDevice(csrfToken, {
        deviceName: "Web browser",
        identityPublicKey: identity.identityPublicKey,
        registrationId: identity.registrationId,
      });
    } catch (error) {
      vault.store.reset();
      throw error;
    }
    vault.store.deviceId = created.device.id;
    vault.store.markReady();
    await vault.persist();
    await publishLocalPreKeys(csrfToken, vault.store);
    await vault.persist();
    return {
      deviceId: created.device.id,
      publicKey: created.device.identityPublicKey,
      registrationId: created.device.registrationId,
    };
  });
}
