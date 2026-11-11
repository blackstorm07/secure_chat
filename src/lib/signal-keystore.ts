import type { MemorySignalStore, SignalSnapshot } from "@/lib/signal-session";

const DB_NAME = "securechat-signal";
const STORE = "state";
const RECORD_ID = "local";

interface SignalRow {
  id: typeof RECORD_ID;
  snapshot: SignalSnapshot;
}

export interface OpenSignalStore {
  store: MemorySignalStore;
  persist: () => Promise<void>;
  reload: () => Promise<void>;
}

let singleton: Promise<OpenSignalStore> | null = null;
let queue: Promise<unknown> = Promise.resolve();
let persistChain: Promise<void> = Promise.resolve();

function schedulePersist(store: MemorySignalStore): Promise<void> {
  const run = persistChain.then(() => writeSnapshot(store.exportSnapshot()));
  persistChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function withSignal<T>(task: (vault: OpenSignalStore) => Promise<T>): Promise<T> {
  const run = queue.then(() => openSignalStore().then(task));
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function openSignalStore(): Promise<OpenSignalStore> {
  singleton ??= openOnce();
  return singleton;
}

export async function resetSignalStore(): Promise<void> {
  singleton = null;
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
      reject(request.error ?? new Error("Signal storage could not be cleared"));
    };
  });
}

async function openOnce(): Promise<OpenSignalStore> {
  if (typeof window === "undefined") throw new Error("Signal keys stay in this browser");
  const { MemorySignalStore } = await import("@/lib/signal-session");
  const store = new MemorySignalStore();
  const vault: OpenSignalStore = {
    store,
    persist: () => schedulePersist(store),
    reload: async () => {
      const snapshot = await readSnapshot();
      if (snapshot) store.importSnapshot(snapshot);
      else store.reset();
    },
  };
  const snapshot = await readSnapshot();
  if (snapshot) store.importSnapshot(snapshot);
  store.onMutation = () => {
    void schedulePersist(store);
  };
  store.markReady();
  return vault;
}

function writeSnapshot(snapshot: SignalSnapshot): Promise<void> {
  if (typeof indexedDB === "undefined") return Promise.resolve();
  return openDatabase().then(
    (database) =>
      new Promise<void>((resolve, reject) => {
        const row: SignalRow = { id: RECORD_ID, snapshot };
        const request = database.transaction(STORE, "readwrite").objectStore(STORE).put(row);
        request.onsuccess = () => {
          database.close();
          resolve();
        };
        request.onerror = () => {
          database.close();
          reject(request.error ?? new Error("Signal storage could not be saved"));
        };
      }),
  );
}

function readSnapshot(): Promise<SignalSnapshot | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return openDatabase().then(
    (database) =>
      new Promise<SignalSnapshot | null>((resolve, reject) => {
        const request = database.transaction(STORE, "readonly").objectStore(STORE).get(RECORD_ID);
        request.onsuccess = () => {
          const row = request.result as SignalRow | undefined;
          database.close();
          resolve(row?.snapshot ?? null);
        };
        request.onerror = () => {
          database.close();
          reject(request.error ?? new Error("Signal storage could not be read"));
        };
      }),
  );
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("This browser cannot store Signal keys"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Signal storage is unavailable"));
  });
}
