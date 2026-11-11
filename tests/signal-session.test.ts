import { describe, expect, it } from "vitest";
import type { DeviceType } from "@privacyresearch/libsignal-protocol-typescript";
import { assertPublicKeyMaterial } from "@/server/utils/key-material";
import { PUBLIC_KEY_MAX_BYTES, PUBLIC_KEY_MIN_BYTES, SIGNATURE_MAX_BYTES, SIGNATURE_MIN_BYTES } from "@/server/config/constants";
import {
  MemorySignalStore,
  acceptPreKeyBundle,
  createSignalAccount,
  decodeKey,
  decryptCiphertext,
  encryptPlaintext,
} from "@/lib/signal-session";

async function bundleFor(store: MemorySignalStore): Promise<DeviceType> {
  const material = store.publicMaterial();
  const preKey = material.oneTimePreKeys[0];
  if (!preKey) throw new Error("missing prekey");
  return {
    registrationId: material.registrationId,
    identityKey: decodeKey(material.identityPublicKey),
    signedPreKey: {
      keyId: material.signedPreKeyId,
      publicKey: decodeKey(material.signedPreKeyPublic),
      signature: decodeKey(material.signedPreKeySignature),
    },
    preKey: { keyId: preKey.keyId, publicKey: decodeKey(preKey.publicKey) },
  };
}

describe("Signal session", () => {
  it("encrypts a message the other device can decrypt and ratchets the next one", async () => {
    const alice = new MemorySignalStore();
    const bob = new MemorySignalStore();
    const aliceMaterial = await createSignalAccount(alice);
    const bobMaterial = await createSignalAccount(bob);
    assertPublicKeyMaterial(aliceMaterial.identityPublicKey, PUBLIC_KEY_MIN_BYTES, PUBLIC_KEY_MAX_BYTES, "Identity public key");
    assertPublicKeyMaterial(aliceMaterial.signedPreKeyPublic, PUBLIC_KEY_MIN_BYTES, PUBLIC_KEY_MAX_BYTES, "Signed prekey");
    assertPublicKeyMaterial(aliceMaterial.signedPreKeySignature, SIGNATURE_MIN_BYTES, SIGNATURE_MAX_BYTES, "Signed prekey signature");

    alice.deviceId = "alice-device";
    bob.deviceId = "bob-device";
    await acceptPreKeyBundle(alice, "bob-device", await bundleFor(bob));
    const first = await encryptPlaintext(alice, "bob-device", "Hello");
    expect(first.messageType).toBe("prekey");
    expect(first.ciphertext).not.toContain("Hello");
    expect(await decryptCiphertext(bob, "alice-device", first.messageType, first.ciphertext)).toBe("Hello");

    const second = await encryptPlaintext(alice, "bob-device", "Again");
    expect(second.messageType).toBe("prekey");
    expect(await decryptCiphertext(bob, "alice-device", second.messageType, second.ciphertext)).toBe("Again");

    await acceptPreKeyBundle(bob, "alice-device", await bundleFor(alice));
    const reply = await encryptPlaintext(bob, "alice-device", "Reply");
    expect(await decryptCiphertext(alice, "bob-device", reply.messageType, reply.ciphertext)).toBe("Reply");

    const third = await encryptPlaintext(alice, "bob-device", "After reply");
    expect(third.messageType).toBe("message");
    expect(await decryptCiphertext(bob, "alice-device", third.messageType, third.ciphertext)).toBe("After reply");
    expect(bobMaterial.identityPublicKey).not.toBe(aliceMaterial.identityPublicKey);
  });

  it("decrypts after the private key is restored from browser storage", async () => {
    const alice = new MemorySignalStore();
    const bob = new MemorySignalStore();
    await createSignalAccount(alice);
    await createSignalAccount(bob);
    alice.deviceId = "alice-device";
    bob.deviceId = "bob-device";
    await acceptPreKeyBundle(alice, "bob-device", await bundleFor(bob));
    const encrypted = await encryptPlaintext(alice, "bob-device", "After login");
    const snapshot = bob.exportSnapshot();
    const asStored = (value: ArrayBuffer) => new Uint8Array(value) as unknown as ArrayBuffer;
    if (!snapshot.identity) throw new Error("missing identity");
    snapshot.identity = { pubKey: asStored(snapshot.identity.pubKey), privKey: asStored(snapshot.identity.privKey) };
    snapshot.preKeys = snapshot.preKeys.map((item) => ({
      keyId: item.keyId,
      keyPair: { pubKey: asStored(item.keyPair.pubKey), privKey: asStored(item.keyPair.privKey) },
    }));
    snapshot.signedPreKeys = snapshot.signedPreKeys.map((item) => ({
      keyId: item.keyId,
      keyPair: { pubKey: asStored(item.keyPair.pubKey), privKey: asStored(item.keyPair.privKey) },
    }));
    const restored = new MemorySignalStore();
    restored.importSnapshot(snapshot);
    expect(restored.identity?.privKey).toBeInstanceOf(ArrayBuffer);
    expect(await decryptCiphertext(restored, "alice-device", encrypted.messageType, encrypted.ciphertext)).toBe("After login");
  });
});
