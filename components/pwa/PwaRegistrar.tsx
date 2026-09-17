"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker SRH Ops et gère le prompt d'installation PWA
 * (beforeinstallprompt). Sans aucune dépendance.
 */
export function PwaRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          console.info("[PWA] Service worker enregistré (scope:", reg.scope, ")");
        })
        .catch((err) => {
          console.warn("[PWA] Enregistrement SW impossible:", err);
        });
    };

    register();
  }, []);

  return null;
}
