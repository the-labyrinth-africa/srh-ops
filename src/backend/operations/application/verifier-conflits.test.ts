import { describe, it, expect } from "vitest";
import { creerVerificationConflits } from "./verifier-conflits";
import {
  AffectationsEnMemoire,
  type AffectationEnregistree,
} from "../infrastructure/en-memoire/affectations.en-memoire";

const h = (heure: string) => new Date(`2026-10-01T${heure}:00Z`);

const enregistree = (surcharge: Partial<AffectationEnregistree> = {}): AffectationEnregistree => ({
  operationId: "op-1",
  dateHeurePrevue: h("08:00"),
  dureeEstimeeMinutes: 120,
  equipeId: "equipe-a",
  vehiculeId: "vehicule-a",
  statut: "Affectée",
  ...surcharge,
});

describe("vérification des conflits d'affectation (cas d'usage)", () => {
  it("sans équipe ni véhicule : aucun conflit, et le port n'est pas interrogé", async () => {
    const affectations = new AffectationsEnMemoire([enregistree()]);
    const verifier = creerVerificationConflits({ affectations });

    expect(await verifier({ dateHeurePrevue: h("09:00") })).toEqual([]);
    expect(await verifier({ dateHeurePrevue: h("09:00"), equipeId: "", vehiculeId: "" })).toEqual([]);
    expect(affectations.appels).toHaveLength(0);
  });

  it("interroge le port avec la fin du créneau demandé et l'opération à exclure", async () => {
    const affectations = new AffectationsEnMemoire();
    const verifier = creerVerificationConflits({ affectations });

    await verifier({
      dateHeurePrevue: h("09:00"),
      dureeEstimeeMinutes: 60,
      equipeId: "equipe-a",
      excludeOperationId: "op-9",
    });

    expect(affectations.appels).toEqual([
      { debutAvant: h("10:00"), equipeId: "equipe-a", vehiculeId: undefined, exclureOperationId: "op-9" },
    ]);
  });

  it("durée absente : la borne est à 120 minutes", async () => {
    const affectations = new AffectationsEnMemoire();
    await creerVerificationConflits({ affectations })({ dateHeurePrevue: h("09:00"), vehiculeId: "vehicule-a" });
    expect(affectations.appels[0].debutAvant).toEqual(h("11:00"));
  });

  it("signale l'équipe et le véhicule occupés", async () => {
    const verifier = creerVerificationConflits({ affectations: new AffectationsEnMemoire([enregistree()]) });
    const conflits = await verifier({ dateHeurePrevue: h("09:00"), equipeId: "equipe-a", vehiculeId: "vehicule-a" });
    expect(conflits.map((c) => c.message)).toEqual([
      "L'équipe est déjà affectée à une opération sur ce créneau",
      "Le véhicule est déjà affecté à une opération sur ce créneau",
    ]);
  });

  it.each(["Annulée", "Terminée", "Rapportée"] as const)("une opération %s ne bloque rien", async (statut) => {
    const verifier = creerVerificationConflits({ affectations: new AffectationsEnMemoire([enregistree({ statut })]) });
    expect(await verifier({ dateHeurePrevue: h("09:00"), equipeId: "equipe-a" })).toEqual([]);
  });

  it("une opération ne se bloque pas elle-même (modification)", async () => {
    const verifier = creerVerificationConflits({ affectations: new AffectationsEnMemoire([enregistree()]) });
    expect(
      await verifier({ dateHeurePrevue: h("08:30"), equipeId: "equipe-a", excludeOperationId: "op-1" })
    ).toEqual([]);
  });
});
