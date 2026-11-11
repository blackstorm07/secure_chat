import {
  KeyHelper,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
  type DeviceType,
  type KeyPairType,
  type StorageType,
} from "@privacyresearch/libsignal-protocol-typescript";
import { base64ToBytes, bytesToBase64 } from "@/lib/utils";

export const SIGNAL_PROTOCOL_VERSION = "signal-protocol-v3";
export const PREKEY_TARGET = 20;

export interface PublicPreKey {
  keyId: number;
  publicKey: string;
}

export interface SignalAccountMaterial {
  identityPublicKey: string;
  registrationId: number;
  signedPreKeyId: number;
  signedPreKeyPublic: string;
  signedPreKeySignature: string;
  oneTimePreKeys: PublicPreKey[];
}

export interface SignalSnapshot {
  deviceId: string | null;
  registrationId: number;
  nextPreKeyId: number;
  signedPreKeyId: number;
  signedPreKeySignature: ArrayBuffer | null;
  bundlePublished: boolean;
  identity: KeyPairType | null;
  preKeys: Array<{ keyId: number; keyPair: KeyPairType }>;
  signedPreKeys: Array<{ keyId: number; keyPair: KeyPairType }>;
  sessions: Array<{ address: string; record: string }>;
  identities: Array<{ id: string; key: ArrayBuffer }>;
  sentPlaintext: Array<{ clientMessageId: string; text: string }>;
}

function identityId(identifier: string): string {
  return identifier.replace(/\.\d+$/, "");
}

function copyBuffer(value: ArrayBuffer | Uint8Array | null | undefined): ArrayBuffer | null {
  if (value == null) return null;
  const bytes = ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : new Uint8Array(value);
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function copyKeyPair(keyPair: KeyPairType): KeyPairType {
  const pubKey = copyBuffer(keyPair.pubKey);
  const privKey = copyBuffer(keyPair.privKey);
  if (!pubKey || !privKey) throw new Error("Signal key could not be restored");
  return { pubKey, privKey };
}

function sameBytes(left: ArrayBuffer, right: ArrayBuffer): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function numericId(value: string | number): number {
  const id = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(id)) throw new Error("Prekey id is invalid");
  return id;
}

export function encodeKey(buffer: ArrayBuffer): string {
  return bytesToBase64(new Uint8Array(buffer));
}

export function decodeKey(value: string): ArrayBuffer {
  const bytes = base64ToBytes(value);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function utf8ToBuffer(text: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(text);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function binaryToBase64(value: string): string {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index) & 0xff;
  return bytesToBase64(bytes);
}

function base64ToBinary(value: string): string {
  const bytes = base64ToBytes(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return binary;
}

function addressFor(deviceId: string): SignalProtocolAddress {
  return new SignalProtocolAddress(deviceId, 1);
}

export class MemorySignalStore implements StorageType {
  deviceId: string | null = null;
  registrationId = 0;
  nextPreKeyId = 1;
  signedPreKeyId = 0;
  signedPreKeySignature: ArrayBuffer | null = null;
  bundlePublished = false;
  identity: KeyPairType | null = null;
  readonly preKeys = new Map<number, KeyPairType>();
  readonly signedPreKeys = new Map<number, KeyPairType>();
  readonly sessions = new Map<string, string>();
  readonly identities = new Map<string, ArrayBuffer>();
  readonly sentPlaintext = new Map<string, string>();
  onMutation: (() => void) | null = null;
  private ready = false;

  markReady(): void {
    this.ready = true;
  }

  private touch(): void {
    if (this.ready) this.onMutation?.();
  }

  reset(): void {
    this.deviceId = null;
    this.registrationId = 0;
    this.nextPreKeyId = 1;
    this.signedPreKeyId = 0;
    this.signedPreKeySignature = null;
    this.bundlePublished = false;
    this.identity = null;
    this.preKeys.clear();
    this.signedPreKeys.clear();
    this.sessions.clear();
    this.identities.clear();
    this.sentPlaintext.clear();
    this.ready = false;
  }

  exportSnapshot(): SignalSnapshot {
    return {
      deviceId: this.deviceId,
      registrationId: this.registrationId,
      nextPreKeyId: this.nextPreKeyId,
      signedPreKeyId: this.signedPreKeyId,
      signedPreKeySignature: this.signedPreKeySignature,
      bundlePublished: this.bundlePublished,
      identity: this.identity,
      preKeys: [...this.preKeys.entries()].map(([keyId, keyPair]) => ({ keyId, keyPair })),
      signedPreKeys: [...this.signedPreKeys.entries()].map(([keyId, keyPair]) => ({ keyId, keyPair })),
      sessions: [...this.sessions.entries()].map(([address, record]) => ({ address, record })),
      identities: [...this.identities.entries()].map(([id, key]) => ({ id, key })),
      sentPlaintext: [...this.sentPlaintext.entries()].map(([clientMessageId, text]) => ({ clientMessageId, text })),
    };
  }

  importSnapshot(snapshot: SignalSnapshot): void {
    this.reset();
    this.deviceId = snapshot.deviceId;
    this.registrationId = snapshot.registrationId;
    this.nextPreKeyId = snapshot.nextPreKeyId;
    this.signedPreKeyId = snapshot.signedPreKeyId;
    this.signedPreKeySignature = copyBuffer(snapshot.signedPreKeySignature);
    this.bundlePublished = snapshot.bundlePublished;
    this.identity = snapshot.identity ? copyKeyPair(snapshot.identity) : null;
    for (const item of snapshot.preKeys) this.preKeys.set(item.keyId, copyKeyPair(item.keyPair));
    for (const item of snapshot.signedPreKeys) this.signedPreKeys.set(item.keyId, copyKeyPair(item.keyPair));
    for (const item of snapshot.sessions) this.sessions.set(item.address, item.record);
    for (const item of snapshot.identities) {
      const key = copyBuffer(item.key);
      if (key) this.identities.set(item.id, key);
    }
    for (const item of snapshot.sentPlaintext) this.sentPlaintext.set(item.clientMessageId, item.text);
  }

  rememberPlaintext(clientMessageId: string, text: string): void {
    this.sentPlaintext.set(clientMessageId, text);
    while (this.sentPlaintext.size > 500) {
      const oldest = this.sentPlaintext.keys().next().value;
      if (oldest === undefined) break;
      this.sentPlaintext.delete(oldest);
    }
    this.touch();
  }

  recallPlaintext(clientMessageId: string): string | null {
    return this.sentPlaintext.get(clientMessageId) ?? null;
  }

  async getIdentityKeyPair(): Promise<KeyPairType | undefined> {
    if (!this.identity) return undefined;
    this.identity = copyKeyPair(this.identity);
    return this.identity;
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    return this.registrationId || undefined;
  }

  async isTrustedIdentity(identifier: string, identityKey: ArrayBuffer): Promise<boolean> {
    const current = this.identities.get(identityId(identifier));
    if (!current) return true;
    return sameBytes(current, identityKey);
  }

  async saveIdentity(encodedAddress: string, publicKey: ArrayBuffer): Promise<boolean> {
    const id = identityId(encodedAddress);
    const current = this.identities.get(id);
    const changed = current ? !sameBytes(current, publicKey) : false;
    this.identities.set(id, publicKey);
    this.touch();
    return changed;
  }

  async loadPreKey(encodedAddress: string | number): Promise<KeyPairType | undefined> {
    const keyId = numericId(encodedAddress);
    const current = this.preKeys.get(keyId);
    if (!current) return undefined;
    const keyPair = copyKeyPair(current);
    this.preKeys.set(keyId, keyPair);
    return keyPair;
  }

  async storePreKey(keyId: number | string, keyPair: KeyPairType): Promise<void> {
    this.preKeys.set(numericId(keyId), keyPair);
    this.touch();
  }

  async removePreKey(keyId: number | string): Promise<void> {
    this.preKeys.delete(numericId(keyId));
    this.touch();
  }

  async loadSignedPreKey(keyId: number | string): Promise<KeyPairType | undefined> {
    const id = numericId(keyId);
    const current = this.signedPreKeys.get(id);
    if (!current) return undefined;
    const keyPair = copyKeyPair(current);
    this.signedPreKeys.set(id, keyPair);
    return keyPair;
  }

  async storeSignedPreKey(keyId: number | string, keyPair: KeyPairType): Promise<void> {
    this.signedPreKeys.set(numericId(keyId), keyPair);
    this.touch();
  }

  async removeSignedPreKey(keyId: number | string): Promise<void> {
    this.signedPreKeys.delete(numericId(keyId));
    this.touch();
  }

  async loadSession(encodedAddress: string): Promise<string | undefined> {
    return this.sessions.get(encodedAddress);
  }

  async storeSession(encodedAddress: string, record: string): Promise<void> {
    this.sessions.set(encodedAddress, record);
    this.touch();
  }

  publicMaterial(): SignalAccountMaterial {
    if (!this.identity || !this.signedPreKeySignature || this.signedPreKeyId < 1) {
      throw new Error("This device has no Signal identity");
    }
    const signed = this.signedPreKeys.get(this.signedPreKeyId);
    if (!signed) throw new Error("This device has no signed prekey");
    return {
      identityPublicKey: encodeKey(this.identity.pubKey),
      registrationId: this.registrationId,
      signedPreKeyId: this.signedPreKeyId,
      signedPreKeyPublic: encodeKey(signed.pubKey),
      signedPreKeySignature: encodeKey(this.signedPreKeySignature),
      oneTimePreKeys: [...this.preKeys.entries()].map(([keyId, keyPair]) => ({ keyId, publicKey: encodeKey(keyPair.pubKey) })),
    };
  }
}

function registrationId(): number {
  let id = 0;
  while (id < 1) id = KeyHelper.generateRegistrationId();
  return id;
}

export async function createSignalAccount(store: MemorySignalStore): Promise<SignalAccountMaterial> {
  const identity = await KeyHelper.generateIdentityKeyPair();
  store.identity = identity;
  store.registrationId = registrationId();
  const signed = await KeyHelper.generateSignedPreKey(identity, 1);
  store.signedPreKeyId = signed.keyId;
  store.signedPreKeySignature = signed.signature;
  await store.storeSignedPreKey(signed.keyId, signed.keyPair);
  store.nextPreKeyId = 1;
  await replenishPreKeys(store);
  return store.publicMaterial();
}

export async function replenishPreKeys(store: MemorySignalStore): Promise<boolean> {
  let added = false;
  while (store.preKeys.size < PREKEY_TARGET) {
    const preKey = await KeyHelper.generatePreKey(store.nextPreKeyId);
    store.nextPreKeyId += 1;
    await store.storePreKey(preKey.keyId, preKey.keyPair);
    added = true;
  }
  return added;
}

export async function hasSession(store: MemorySignalStore, deviceId: string): Promise<boolean> {
  const cipher = new SessionCipher(store, addressFor(deviceId));
  return cipher.hasOpenSession();
}

export async function acceptPreKeyBundle(store: MemorySignalStore, deviceId: string, device: DeviceType): Promise<void> {
  const builder = new SessionBuilder(store, addressFor(deviceId));
  await builder.processPreKey(device);
}

export async function encryptPlaintext(
  store: MemorySignalStore,
  deviceId: string,
  text: string,
): Promise<{ messageType: "prekey" | "message"; ciphertext: string }> {
  const cipher = new SessionCipher(store, addressFor(deviceId));
  const encrypted = await cipher.encrypt(utf8ToBuffer(text));
  if (!encrypted.body) throw new Error("Signal encryption returned an empty envelope");
  if (encrypted.type !== 3 && encrypted.type !== 1) throw new Error("Signal encryption returned an unknown message type");
  return {
    messageType: encrypted.type === 3 ? "prekey" : "message",
    ciphertext: binaryToBase64(encrypted.body),
  };
}

const SAFETY_ITERATIONS = 5200;

function concatBuffers(parts: ArrayBuffer[]): ArrayBuffer {
  const bytes = parts.map((part) => new Uint8Array(part));
  const total = bytes.reduce((sum, part) => sum + part.byteLength, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const part of bytes) {
    combined.set(part, offset);
    offset += part.byteLength;
  }
  return combined.buffer;
}

function identifierBytes(identifier: string): ArrayBuffer {
  const bytes = new Uint8Array(identifier.length);
  for (let index = 0; index < identifier.length; index += 1) {
    const code = identifier.charCodeAt(index);
    if (code > 0xff) throw new Error("Safety number identifier is not a byte string");
    bytes[index] = code;
  }
  return bytes.buffer;
}

function safetyChunk(hash: Uint8Array, offset: number): string {
  const value =
    (hash[offset]! * 2 ** 32 + hash[offset + 1]! * 2 ** 24 + hash[offset + 2]! * 2 ** 16 + hash[offset + 3]! * 2 ** 8 + hash[offset + 4]!) %
    100000;
  return String(value).padStart(5, "0");
}

async function safetyHalf(identifier: string, key: ArrayBuffer): Promise<string> {
  let data = concatBuffers([new Uint16Array([0]).buffer, key, identifierBytes(identifier)]);
  for (let iteration = 0; iteration < SAFETY_ITERATIONS; iteration += 1) {
    data = await crypto.subtle.digest("SHA-512", concatBuffers([data, key]));
  }
  const hash = new Uint8Array(data);
  return [0, 5, 10, 15, 20, 25].map((offset) => safetyChunk(hash, offset)).join("");
}

export async function displaySafetyNumber(
  localDeviceId: string,
  localIdentity: ArrayBuffer,
  remoteDeviceId: string,
  remoteIdentity: ArrayBuffer,
): Promise<string> {
  const [local, remote] = await Promise.all([safetyHalf(localDeviceId, localIdentity), safetyHalf(remoteDeviceId, remoteIdentity)]);
  return [local, remote].sort().join("");
}

export async function decryptCiphertext(
  store: MemorySignalStore,
  senderDeviceId: string,
  messageType: "prekey" | "message",
  ciphertext: string,
): Promise<string> {
  const cipher = new SessionCipher(store, addressFor(senderDeviceId));
  const body = base64ToBinary(ciphertext);
  const plaintext = messageType === "prekey" ? await cipher.decryptPreKeyWhisperMessage(body) : await cipher.decryptWhisperMessage(body);
  return new TextDecoder().decode(plaintext);
}
