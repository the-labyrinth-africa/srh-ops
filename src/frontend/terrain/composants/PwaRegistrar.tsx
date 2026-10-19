"use client";

import { useEffect } from "react";

export async function manageServiceWorker(
  env: Record<string, string | undefined> = process.env,
  swNavigator: typeof navigator.serviceWorker | undefined = typeof navigator !== "undefined"
    ? navigator.serviceWorker
    : undefined
): Promise<"registered" | "cleaned" | "unsupported"> {
  if (!swNavigator) return "unsupported";

  const disabled = env.NEXT_PUBLIC_ENABLE_PWA === "false";

  if (!disabled) {
    try {
      const reg = await swNavigator.register("/sw.js", { scope: "/" });
      console.info("[PWA] Service worker opérationnel (scope:", reg.scope, ")");
      return "registered";
    } catch (err) {
      console.warn("[PWA] Enregistrement SW impossible:", err);
      return "unsupported";
    }
  }

  let cleanupSucceeded = true;
  try {
    const registrations = await swNavigator.getRegistrations();
    await Promise.all(registrations.map((reg) => reg.unregister()));
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
 * Enregistrement du service worker PWA SRH Ops.
 *
 * Le service worker gère la mise en cache réseau d'abord, le repli hors-ligne
 * et la synchronisation avec l'outbox IndexedDB.
 * Il est activé par défaut, sauf si explicitement désactivé (`NEXT_PUBLIC_ENABLE_PWA="false"`).
 */
export function PwaRegistrar() {
  useEffect(() => {
    void manageServiceWorker();
  }, []);

  return null;
}
