import type { QuantiteUnite } from "@/shared/operations/quantites";
import type { OperationStatus } from "@/shared/operations/statuts";

const DB_NAME = "srh-offline-outbox";
const STORE = "pending";
const VERSION = 1;

export type PendingKind = "statut" | "photos";

export interface PendingStatusPayload {
  statut?: OperationStatus;
  quantiteCollectee?: number;
  uniteQuantite?: QuantiteUnite;
  remarquesTerrain?: string;
  nomSignataireClient?: string;
  signatureClient?: string;
}

export interface PendingMutation {
  kind: PendingKind;
  id: string;
  payload?: PendingStatusPayload;
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

/** Met à jour une mutation existante dans l'outbox (ex: photos restantes). */
export async function updatePending(ts: number, mutation: PendingMutation): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ ts, mutation });
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

interface MutationOutcome {
  status: "success" | "transient" | "fatal";
  reste: PendingMutation | null;
}

/**
 * Applique une mutation. Renvoie son statut d'exécution :
 * - success : mutation appliquée, retirée de la file.
 * - fatal : erreur 4xx définitive, retirée de la file pour ne pas la bloquer.
 * - transient : erreur réseau ou temporaire, conservée pour le prochain cycle.
 */
async function applyMutation(m: PendingMutation): Promise<MutationOutcome> {
  const base = `/api/operations/${m.id}`;
  if (m.kind === "statut") {
    try {
      const res = await fetch(`${base}/statut`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(m.payload ?? {}),
      });
      if (res.ok) {
        return { status: "success", reste: null };
      }
      if (typeof res.status === "number" && res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408) {
        console.warn("[outbox] mutation statut rejetée définitivement (4xx):", res.status);
        return { status: "fatal", reste: null };
      }
      return { status: "transient", reste: m };
    } catch (err) {
      console.warn("[outbox] erreur réseau statut (rejouera):", err);
      return { status: "transient", reste: m };
    }
  }

  // La route n'accepte qu'une photo par requête : `{ photo: <data URL>, nom }`.
  const photos = m.photos ?? [];
  if (photos.length === 0) {
    return { status: "success", reste: null };
  }

  for (let i = 0; i < photos.length; i++) {
    try {
      const res = await fetch(`${base}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo: photos[i].dataUrl, nom: photos[i].nom }),
      });
      if (!res.ok) {
        if (typeof res.status === "number" && res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408) {
          console.warn("[outbox] photo rejetée définitivement (4xx):", res.status);
          const restant = photos.slice(i + 1);
          return restant.length > 0
            ? { status: "transient", reste: { ...m, photos: restant } }
            : { status: "fatal", reste: null };
        }
        return { status: "transient", reste: { ...m, photos: photos.slice(i) } };
      }
    } catch (err) {
      console.warn("[outbox] photo erreur réseau (rejouera):", err);
      return { status: "transient", reste: { ...m, photos: photos.slice(i) } };
    }
  }
  return { status: "success", reste: null };
}

/**
 * Rejoue l'outbox FIFO avec des transactions discrètes.
 * Aucun `fetch` n'est exécuté pendant une transaction active (évite `TransactionInactiveError`).
 * Erreur transitoire → pause du rejeu pour préserver l'ordre FIFO.
 */
export async function replayOutbox(): Promise<{ replayed: number; failed: number }> {
  const pendingRows = await getAllPending();
  let replayed = 0;
  let failed = 0;

  for (const row of pendingRows) {
    let outcome: MutationOutcome;
    try {
      outcome = await applyMutation(row.mutation);
    } catch (err) {
      console.warn("[outbox] échec d'application :", err);
      outcome = { status: "transient", reste: row.mutation };
    }

    if (outcome.status === "success") {
      await removePending(row.ts);
      replayed += 1;
    } else if (outcome.status === "fatal") {
      await removePending(row.ts);
      failed += 1;
    } else {
      if (outcome.reste && outcome.reste !== row.mutation) {
        await updatePending(row.ts, outcome.reste);
      }
      failed += 1;
      break;
    }
  }

  closeDb();
  return { replayed, failed };
}
