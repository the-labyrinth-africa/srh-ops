const DB_NAME = "srh-offline-outbox";
const STORE = "pending";
const VERSION = 1;

export type PendingKind = "statut" | "photos";

export interface PendingMutation {
  kind: PendingKind;
  id: string;
  payload?: { statut?: string };
  photos?: Array<{ dataUrl: string; nom: string }>;
}

export interface PendingRow {
  ts: number;
  mutation: PendingMutation;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "ts" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function closeDb(): void {
  if (dbPromise) {
    dbPromise.then((db) => db.close()).catch(() => {});
    dbPromise = null;
  }
}

let lastTs = 0;

/** Clé strictement croissante : deux mutations dans la même milliseconde ne doivent pas s'écraser. */
function nextTs(): number {
  lastTs = Math.max(Date.now(), lastTs + 1);
  return lastTs;
}

/** Ajoute une mutation à l'outbox (à rejouer plus tard, FIFO). */
export async function enqueueMutation(m: PendingMutation): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ ts: nextTs(), mutation: m });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Liste les mutations en attente (FIFO, triées par ts). */
export async function getAllPending(): Promise<PendingRow[]> {
  const db = await openDb();
  return new Promise<PendingRow[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    tx.oncomplete = () =>
      resolve((req.result as PendingRow[]).slice().sort((a, b) => a.ts - b.ts));
    tx.onerror = () => reject(tx.error);
    req.onerror = () => reject(req.error);
  });
}

/** Retire une mutation précise de l'outbox (par ts). */
export async function removePending(ts: number): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(ts);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Vide entièrement l'outbox. */
export async function clearOutbox(): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }).finally(() => closeDb());
}

/**
 * Applique une mutation. Renvoie `null` si elle est entièrement appliquée, sinon ce qu'il en
 * reste à rejouer : la mutation elle-même, ou — pour un lot de photos interrompu — les seules
 * photos non encore envoyées (une photo déjà acceptée ne doit pas être renvoyée en double).
 */
async function applyMutation(m: PendingMutation): Promise<PendingMutation | null> {
  const base = `/api/operations/${m.id}`;
  if (m.kind === "statut") {
    const res = await fetch(`${base}/statut`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(m.payload ?? {}),
    });
    return res.ok ? null : m;
  }
  // La route n'accepte qu'une photo par requête : `{ photo: <data URL>, nom }`.
  const photos = m.photos ?? [];
  for (let i = 0; i < photos.length; i++) {
    let ok = false;
    try {
      const res = await fetch(`${base}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo: photos[i].dataUrl, nom: photos[i].nom }),
      });
      ok = res.ok;
    } catch (err) {
      console.warn("[outbox] mutation rejouera:", m.kind, err);
    }
    if (!ok) return { ...m, photos: photos.slice(i) };
  }
  return null;
}

/**
 * Rejoue l'outbox FIFO via UNE transaction cursor readwrite.
 * Mutation réussie → cursor.delete() inline ; échec → reste (rejouera).
 * Une seule transaction évite le « Unknown Error: null » de concurrent transactions.
 */
export async function replayOutbox(): Promise<{ replayed: number; failed: number }> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let replayed = 0;
    let failed = 0;

    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.openCursor();

    const step = async () => {
      const cursor = req.result;
      if (!cursor) {
        tx.oncomplete = () => {
          closeDb();
          resolve({ replayed, failed });
        };
        return;
      }
      const row = cursor.value as PendingRow;
      let reste: PendingMutation | null = row.mutation;
      try {
        reste = await applyMutation(row.mutation);
      } catch (err) {
        console.warn("[outbox] mutation rejouera:", row.mutation.kind, err);
      }
      if (reste === null) {
        cursor.delete();
        replayed += 1;
      } else {
        // Lot de photos partiellement envoyé : ne garder que ce qui reste à envoyer.
        if (reste !== row.mutation) cursor.update({ ts: row.ts, mutation: reste });
        failed += 1;
      }
      cursor.continue();
    };

    req.onsuccess = () => void step();
    req.onerror = () => {
      closeDb();
      reject(req.error);
    };
    tx.onerror = () => {
      closeDb();
      reject(tx.error);
    };
  });
}
