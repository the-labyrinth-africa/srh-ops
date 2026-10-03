import { describe, it, expect } from "vitest";
import { computeEffectiveStatus } from "./statut-effectif";

const MAINTENANT = new Date("2026-10-03T12:00:00.000Z");
const AVANT = new Date("2026-10-03T11:59:59.999Z");
const APRES = new Date("2026-10-03T12:00:00.001Z");

describe("computeEffectiveStatus (horloge injectée)", () => {
  it.each(["Planifiée", "Affectée", "En route", "En cours"] as const)(
    "%s dont la date est dépassée devient Retardée",
    (statut) => {
      expect(computeEffectiveStatus(statut, AVANT, MAINTENANT)).toBe("Retardée");
    }
  );

  it("une opération prévue exactement maintenant n'est pas en retard (comparaison stricte)", () => {
    expect(computeEffectiveStatus("Planifiée", new Date(MAINTENANT), MAINTENANT)).toBe("Planifiée");
  });

  it("une opération à venir garde son statut", () => {
    expect(computeEffectiveStatus("Affectée", APRES, MAINTENANT)).toBe("Affectée");
  });

  it("Retardée reste Retardée, que la date soit passée ou future", () => {
    expect(computeEffectiveStatus("Retardée", AVANT, MAINTENANT)).toBe("Retardée");
    expect(computeEffectiveStatus("Retardée", APRES, MAINTENANT)).toBe("Retardée");
  });

  it.each(["Terminée", "Rapportée", "Annulée"] as const)("%s (terminal) ne bascule jamais", (statut) => {
    expect(computeEffectiveStatus(statut, AVANT, MAINTENANT)).toBe(statut);
  });

  it("sans horloge fournie, utilise l'instant présent", () => {
    expect(computeEffectiveStatus("Planifiée", new Date(Date.now() - 3_600_000))).toBe("Retardée");
    expect(computeEffectiveStatus("Planifiée", new Date(Date.now() + 3_600_000))).toBe("Planifiée");
  });
});
