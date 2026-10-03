import { describe, it, expect } from "vitest";
import { messageAlerteCoherence, terminaisonSansEnCours } from "./changement-statut";

describe("terminaisonSansEnCours", () => {
  it.each(["Planifiée", "Affectée", "En route", "Retardée", "Terminée"] as const)(
    "%s → Terminée : incohérent",
    (ancien) => {
      expect(terminaisonSansEnCours(ancien, "Terminée")).toBe(true);
    }
  );

  it("En cours → Terminée : cohérent", () => {
    expect(terminaisonSansEnCours("En cours", "Terminée")).toBe(false);
  });

  it("vers un autre statut que Terminée : jamais d'alerte", () => {
    expect(terminaisonSansEnCours("Planifiée", "Annulée")).toBe(false);
    expect(terminaisonSansEnCours("Terminée", "Rapportée")).toBe(false);
  });
});

describe("messageAlerteCoherence", () => {
  it("message exact du journal", () => {
    expect(messageAlerteCoherence("abc123", "Retardée")).toBe(
      "[cohérence] Opération abc123 passée Terminée sans En cours (était Retardée)"
    );
  });
});
