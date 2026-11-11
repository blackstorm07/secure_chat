import type { DeviceType } from "@privacyresearch/libsignal-protocol-typescript";
import type { MemorySignalStore } from "@/lib/signal-session";
import { ApiError } from "@/services/api";
import { consumePreKey, getKeyBundle, uploadKeyBundle } from "@/services/keys.service";
import { resetSignalStore, withSignal, type OpenSignalStore } from "@/lib/signal-keystore";
import type { MessageType } from "@/types";

export type EncryptionState = "unavailable" | "unverified" | "verified";

export const signalProtocol = {
  implemented: true,
  state: "unverified" as const,
  version: "signal-protocol-v3",
  reason: "Messages are encrypted in this browser with the Signal protocol before they are sent.",
};

export interface RecipientDevice {
  userId: string;
  deviceId: string;
}

export interface EncryptedOutgoing {
  clientMessageId: string;
  envelopes: Array<{ recipientDeviceId: string; messageType: "prekey" | "message"; ciphertext: string }>;
}

export function describeEncryption(): { state: EncryptionState; label: string; detail: string } {
  return {
    state: "unverified",
    label: "Encrypted, identity unverified",
    detail:
      "Message text is encrypted in this browser with the Signal protocol (X3DH and the Double Ratchet) before it is sent. Compare the safety number to confirm who holds the other device key. The server stores ciphertext and does not verify prekey signatures.",
  };
}

export async function publishLocalPreKeys(csrfToken: string, store: MemorySignalStore): Promise<void> {
  if (!store.deviceId) throw new Error("This browser has no registered device");
  const { replenishPreKeys } = await import("@/lib/signal-session");
  const added = await replenishPreKeys(store);
  if (store.bundlePublished && !added) return;
  const material = store.publicMaterial();
  await uploadKeyBundle(csrfToken, {
    deviceId: store.deviceId,
    signedPreKeyId: material.signedPreKeyId,
    signedPreKeyPublic: material.signedPreKeyPublic,
    signedPreKeySignature: material.signedPreKeySignature,
    oneTimePreKeys: material.oneTimePreKeys,
  });
  store.bundlePublished = true;
}

export async function createLocalSignalAccount(store: MemorySignalStore): Promise<{ identityPublicKey: string; registrationId: number }> {
  const { createSignalAccount } = await import("@/lib/signal-session");
  const material = await createSignalAccount(store);
  return { identityPublicKey: material.identityPublicKey, registrationId: material.registrationId };
}

export async function encryptForRecipients(csrfToken: string, text: string, recipients: RecipientDevice[]): Promise<EncryptedOutgoing> {
  if (!text.trim()) throw new Error("Message is empty");
  if (recipients.length === 0) throw new Error("This conversation has no device that can receive an encrypted message");
  return withSignal(async (vault) => {
    const { encryptPlaintext, hasSession } = await import("@/lib/signal-session");
    const clientMessageId = crypto.randomUUID();
    const envelopes: EncryptedOutgoing["envelopes"] = [];
    const skipped: string[] = [];
    for (const recipient of recipients) {
      if (recipient.deviceId === vault.store.deviceId) continue;
      try {
        if (!(await hasSession(vault.store, recipient.deviceId))) {
          await startSession(vault, csrfToken, recipient);
        }
        const encrypted = await encryptPlaintext(vault.store, recipient.deviceId, text);
        envelopes.push({ recipientDeviceId: recipient.deviceId, ...encrypted });
      } catch (error) {
        if (error instanceof ApiError && (error.status === 404 || error.errorCode === "PREKEY_CONSUMED")) {
          skipped.push(recipient.deviceId);
          continue;
        }
        throw error;
      }
    }
    if (envelopes.length === 0) {
      throw new Error(
        skipped.length > 0
          ? "The other person has not published encryption keys yet. Ask them to open SecureChat in their browser, then try again."
          : "No recipient device could be encrypted to.",
      );
    }
    vault.store.rememberPlaintext(clientMessageId, text);
    await vault.persist();
    return { clientMessageId, envelopes };
  });
}

async function startSession(vault: OpenSignalStore, csrfToken: string, recipient: RecipientDevice): Promise<void> {
  const { acceptPreKeyBundle, decodeKey } = await import("@/lib/signal-session");
  const bundle = await getKeyBundle(recipient.userId, recipient.deviceId);
  let preKey: DeviceType["preKey"];
  if (bundle.oneTimePreKeyCount > 0) {
    try {
      const consumed = await consumePreKey(csrfToken, recipient.userId, recipient.deviceId);
      preKey = { keyId: consumed.keyId, publicKey: decodeKey(consumed.publicKey) };
    } catch (error) {
      if (!(error instanceof ApiError) || (error.status !== 404 && error.errorCode !== "PREKEY_CONSUMED")) throw error;
    }
  }
  const device: DeviceType = {
    identityKey: decodeKey(bundle.identityPublicKey),
    registrationId: bundle.registrationId,
    signedPreKey: {
      keyId: bundle.signedPreKeyId,
      publicKey: decodeKey(bundle.signedPreKeyPublic),
      signature: decodeKey(bundle.signedPreKeySignature),
    },
    ...(preKey ? { preKey } : {}),
  };
  await acceptPreKeyBundle(vault.store, recipient.deviceId, device);
}

export async function decryptStoredEnvelope(input: {
  senderDeviceId: string;
  recipientDeviceId: string;
  messageType: MessageType;
  ciphertext: string;
  clientMessageId: string;
}): Promise<string | null> {
  if (typeof indexedDB === "undefined") return null;
  return withSignal(async (vault) => {
    const cached = vault.store.recallPlaintext(input.clientMessageId);
    if (cached) return cached;
    if (input.recipientDeviceId !== vault.store.deviceId || (input.messageType !== "prekey" && input.messageType !== "message")) {
      return null;
    }
    try {
      const { decryptCiphertext } = await import("@/lib/signal-session");
      const text = await decryptCiphertext(vault.store, input.senderDeviceId, input.messageType, input.ciphertext);
      vault.store.rememberPlaintext(input.clientMessageId, text);
      await vault.persist();
      return text;
    } catch {
      return vault.store.recallPlaintext(input.clientMessageId);
    }
  });
}

export async function safetyNumber(remoteDeviceId: string, remoteIdentityKey: string): Promise<string | null> {
  if (typeof indexedDB === "undefined") return null;
  const material = await withSignal(async (vault) => {
    if (!vault.store.deviceId || !vault.store.identity) return null;
    const { decodeKey } = await import("@/lib/signal-session");
    return {
      localDeviceId: vault.store.deviceId,
      localIdentity: vault.store.identity.pubKey,
      remoteIdentity: decodeKey(remoteIdentityKey),
    };
  });
  if (!material) return null;
  const { displaySafetyNumber } = await import("@/lib/signal-session");
  return displaySafetyNumber(material.localDeviceId, material.localIdentity, remoteDeviceId, material.remoteIdentity);
}

export async function clearSignalDevice(): Promise<void> {
  await resetSignalStore();
}
