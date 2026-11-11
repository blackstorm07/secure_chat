import { bytesToBase64 } from "@/lib/utils";

const DB_NAME = "securechat-device";
const STORE = "identity";
const RECORD_ID = "local";

export interface LocalDeviceIdentity {
  deviceId: string;
  publicKey: string;
  registrationId: number;
  privateKey: CryptoKey;
}

interface DeviceRow extends LocalDeviceIdentity {
  id: typeof RECORD_ID;
}

export async function createDeviceIdentity(): Promise<Pick<LocalDeviceIdentity, "publicKey" | "registrationId" | "privateKey">> {
  const registrationBytes = new Uint32Array(1);
  crypto.getRandomValues(registrationBytes);
  const registrationId = ((registrationBytes[0] ?? 0) % 16_777_215) + 1;
  try {
    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" } as AlgorithmIdentifier, false, ["sign", "verify"])) as CryptoKeyPair;
    const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
    return { publicKey: bytesToBase64(new Uint8Array(raw)), registrationId, privateKey: pair.privateKey };
  } catch {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
    const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
    return { publicKey: bytesToBase64(new Uint8Array(spki)), registrationId, privateKey: pair.privateKey };
  }
}

export async function loadDeviceIdentity(): Promise<LocalDeviceIdentity | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE, "readonly").objectStore(STORE).get(RECORD_ID);
    request.onsuccess = () => {
      const row = request.result as DeviceRow | undefined;
      database.close();
      if (!row?.deviceId || !row.privateKey) {
        resolve(null);
        return;
      }
      resolve({
        deviceId: row.deviceId,
        publicKey: row.publicKey,
        registrationId: row.registrationId,
        privateKey: row.privateKey,
      });
    };
    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error("Device storage could not be read"));
    };
  });
}

export async function saveDeviceIdentity(identity: LocalDeviceIdentity): Promise<void> {
  const database = await openDatabase();
  const row: DeviceRow = { id: RECORD_ID, ...identity };
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE, "readwrite").objectStore(STORE).put(row);
    request.onsuccess = () => {
      database.close();
      resolve();
    };
    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error("Device storage could not be saved"));
    };
  });
}

export async function clearDeviceIdentity(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE, "readwrite").objectStore(STORE).delete(RECORD_ID);
    request.onsuccess = () => {
      database.close();
      resolve();
    };
    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error("Device storage could not be cleared"));
    };
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") throw new Error("This browser cannot store a device identity");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Device storage is unavailable"));
  });
}
