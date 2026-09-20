"use client";

import { useEffect } from "react";

/**
 * Enregistrement du service worker SRH Ops.
 *
 * La PWA est désactivée par défaut (`NEXT_PUBLIC_ENABLE_PWA` ≠ "true") : le
 * service worker met en cache des navigations authentifiées sous "/" et sert
 * les requêtes RSC en cache-first, et l'outbox hors-ligne a des défauts connus
 * (voir « Limites connues » du README). Tant que ces points ne sont pas
 * corrigés, le composant non seulement n'enregistre rien, mais désinstalle un
 * service worker déjà présent et vide les caches "srh-ops-*" laissés sur les
 * postes qui ont visité une version précédente.
 */
export function PwaRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const enabled = process.env.NEXT_PUBLIC_ENABLE_PWA === "true";

    if (enabled) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          console.info("[PWA] Service worker enregistré (scope:", reg.scope, ")");
        })
        .catch((err) => {
          console.warn("[PWA] Enregistrement SW impossible:", err);
        });
      return;
    }

    const cleanup = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      } catch {
        // Désinstallation impossible (navigateur ou contexte non sécurisé) : sans effet.
      }

      try {
        if (typeof caches === "undefined") return;
        const keys = await caches.keys();
        await Promise.all(
          keys.filter((key) => key.startsWith("srh-ops-")).map((key) => caches.delete(key))
        );
      } catch {
        // Cache Storage indisponible : rien à nettoyer.
      }
    };

    void cleanup();
  }, []);

  return null;
}
