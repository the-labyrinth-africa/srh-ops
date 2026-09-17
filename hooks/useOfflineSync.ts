import { useCallback, useEffect, useRef, useState } from "react";
import {
  enqueueMutation,
  getAllPending,
  replayOutbox,
} from "@/lib/offline/outbox";
import type { PendingMutation } from "@/lib/offline/outbox";

/**
 * État réseau + rejeu automatique de l'outbox au retour en ligne.
 * Utilisé par le terrain pour basculer proprement hors-ligne.
 */
export function useOfflineSync() {
  const [online, setOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [replaying, setReplaying] = useState(false);
  const busyRef = useRef(false);

  const refreshPending = useCallback(async () => {
    try {
      const all = await getAllPending();
      setPendingCount(all.length);
    } catch (err) {
      console.warn("[offline] lecture de l'outbox impossible:", err);
      setPendingCount(0);
    }
  }, []);

  /** Rejoue l'outbox dans l'ordre (sans marquer décroché si nouvel appel). */
  const replayNow = useCallback(async () => {
    if (busyRef.current || !navigator.onLine) return;
    busyRef.current = true;
    setReplaying(true);
    try {
      await replayOutbox();
    } catch (err) {
      console.warn("[offline] échec du rejeu de l'outbox:", err);
    } finally {
      busyRef.current = false;
      setReplaying(false);
      await refreshPending().catch(() => {});
    }
  }, [refreshPending]);

  useEffect(() => {
    function goOnline() {
      setOnline(true);
      void replayNow();
    }
    function goOffline() {
      setOnline(false);
    }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    void refreshPending();

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [replayNow, refreshPending]);

  /** Enfile une mutation hors-ligne (statut, photos, rapport). */
  const enqueueLocal = useCallback<(m: PendingMutation) => Promise<void>>(
    async (m) => {
      await enqueueMutation(m);
      await refreshPending();
    },
    [refreshPending]
  );

  return {
    online,
    pendingCount,
    replaying,
    replayNow,
    enqueueLocal,
    refreshPending,
  };
}
