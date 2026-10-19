"use client";

import { useEffect } from "react";

export async function removeLegacyServiceWorkers(
  swNavigator: typeof navigator.serviceWorker | undefined = typeof navigator !== "undefined"
    ? navigator.serviceWorker
    : undefined
): Promise<"cleaned" | "unsupported"> {
  if (!swNavigator) return "unsupported";

  let cleanupSucceeded = true;
  try {
    const registrations = await swNavigator.getRegistrations();
    await Promise.all(
      registrations
        .filter((reg) =>
          [reg.active, reg.waiting, reg.installing].some((worker) => {
            if (!worker) return false;
            const script = new URL(worker.scriptURL);
            return script.pathname === "/sw.js" && script.origin === new URL(reg.scope).origin;
          })
        )
        .map((reg) => reg.unregister())
    );
  } catch (err) {
    cleanupSucceeded = false;
    console.warn("[PWA] Désenregistrement du service worker impossible:", err);
  }

  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith("srh-ops-")).map((key) => caches.delete(key))
      );
    }
  } catch (err) {
    cleanupSucceeded = false;
    console.warn("[PWA] Purge du cache impossible:", err);
  }

  return cleanupSucceeded ? "cleaned" : "unsupported";
}

/**
 * Supprime service workers et caches locaux enregistrés par les versions précédentes.
 */
export function ServiceWorkerCleanup() {
  useEffect(() => {
    void removeLegacyServiceWorkers();
  }, []);

  return null;
}
