"use client";

import { useEffect, useState } from "react";
import type { QuantiteUnite } from "@/shared/operations/quantites";

export function useUniteQuantiteGlobale() {
  const [uniteQuantiteGlobale, setUniteQuantiteGlobale] = useState<QuantiteUnite | null>(null);
  const [configurationChargee, setConfigurationChargee] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/plateforme/unite-quantite", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Impossible de charger l'unité globale.");
        const data = await response.json();
        if (!cancelled) setUniteQuantiteGlobale(data.uniteQuantiteGlobale ?? null);
      })
      .catch((error: unknown) => {
        console.error("Chargement de l'unité globale impossible.", error);
      })
      .finally(() => {
        if (!cancelled) setConfigurationChargee(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { uniteQuantiteGlobale, configurationChargee };
}
