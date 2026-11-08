"use client";

// Offline logging: when the network is unavailable, entries are queued in this
// device's IndexedDB and replayed when it comes back. Every item is tagged with
// an anonymous owner key (a hash of the user id) and only replays for that same
// account, so a shared device never syncs one person's entries into another's.
// The queue is cleared on sign-out.

export const OFFLINE_EVENT = "thrivie:offline-queue";
const DB = "thrivie-offline";
const STORE = "queue";

export type QueueItem = { id: string; owner: string; action: string; args: unknown[]; createdAt: number };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? (req as IDBRequest<T>).result : undefined);
    t.onerror = () => reject(t.error);
  });
}

const notify = () => window.dispatchEvent(new Event(OFFLINE_EVENT));

export async function enqueue(owner: string, action: string, args: unknown[]) {
  await tx("readwrite", (s) => s.put({ id: crypto.randomUUID(), owner, action, args, createdAt: Date.now() } satisfies QueueItem));
  notify();
}

export async function pendingCount(): Promise<number> {
  try {
    return (await tx<number>("readonly", (s) => s.count())) ?? 0;
  } catch {
    return 0;
  }
}

export async function allItems(): Promise<QueueItem[]> {
  return ((await tx<QueueItem[]>("readonly", (s) => s.getAll())) ?? []).sort((a, b) => a.createdAt - b.createdAt);
}

export async function remove(id: string) {
  await tx("readwrite", (s) => s.delete(id));
  notify();
}

export async function clearQueue() {
  try {
    await tx("readwrite", (s) => s.clear());
  } catch {}
  notify();
}

export const isNetworkError = (e: unknown) => e instanceof TypeError || (e instanceof Error && /fetch|network|Failed to fetch|Load failed/i.test(e.message));
