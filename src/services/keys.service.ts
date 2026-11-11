import { apiRequest } from "@/services/api";

export interface KeyBundle {
  userId: string;
  deviceId: string;
  registrationId: number;
  identityPublicKey: string;
  signedPreKeyId: number;
  signedPreKeyPublic: string;
  signedPreKeySignature: string;
  oneTimePreKeyCount: number;
  cryptographicallyVerified: boolean;
}

export interface ConsumedPreKey {
  userId: string;
  deviceId: string;
  keyId: number;
  publicKey: string;
}

export function uploadKeyBundle(
  csrfToken: string,
  body: {
    deviceId: string;
    signedPreKeyId: number;
    signedPreKeyPublic: string;
    signedPreKeySignature: string;
    oneTimePreKeys: Array<{ keyId: number; publicKey: string }>;
  },
): Promise<{ bundle: { deviceId: string; signedPreKeyId: number; oneTimePreKeyCount: number; cryptographicallyVerified: boolean } }> {
  return apiRequest("/api/v1/keys/upload", { method: "POST", csrfToken, body });
}

export async function getKeyBundle(userId: string, deviceId: string): Promise<KeyBundle> {
  const result = await apiRequest<{ bundle: KeyBundle }>(`/api/v1/keys/${userId}/${deviceId}`);
  return result.bundle;
}

export async function consumePreKey(csrfToken: string, userId: string, deviceId: string): Promise<ConsumedPreKey> {
  const result = await apiRequest<{ preKey: ConsumedPreKey }>("/api/v1/keys/consume", {
    method: "POST",
    csrfToken,
    body: { userId, deviceId },
  });
  return result.preKey;
}
