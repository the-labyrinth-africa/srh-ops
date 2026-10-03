import { describe, it, expect } from "vitest";
import { bornesDuJour, compterParStatut, operationsEnRetard, type OperationSuivie } from "./statistiques";

const MAINTENANT = new Date(2030, 10, 4, 12, 0, 0, 0);
const PASSE = new Date(2030, 10, 2, 10, 0);
const FUTUR = new Date(2030, 10, 9, 10, 0);

const op = (id: string, statut: OperationSuivie["statut"], dateHeurePrevue: Date): OperationSuivie => ({
  id,
  natureIntervention: `Nature ${id}`,
  dateHeurePrevue,
  statut,
});

describe("compterParStatut", () => {
  it("aucune opération : tout à zéro", () => {
    expect(compterParStatut([], MAINTENANT)).toEqual({ prevues: 0, enCours: 0, terminees: 0, retardees: 0, annulees: 0 });
  });

  it("regroupe sur le statut effectif : une opération dépassée non terminée est en retard", () => {
    const operations = [
      op("1", "Planifiée", FUTUR),
      op("2", "Affectée", FUTUR),
      op("3", "En route", FUTUR),
      op("4", "En cours", FUTUR),
      op("5", "Retardée", FUTUR),
      op("6", "Terminée", PASSE),
      op("7", "Rapportée", PASSE),
      op("8", "Annulée", PASSE),
      op("9", "Planifiée", PASSE),
      op("10", "En cours", PASSE),
    ];
    expect(compterParStatut(operations, MAINTENANT)).toEqual({
      prevues: 2,
      enCours: 2,
      terminees: 2,
      retardees: 3,
      annulees: 1,
    });
  });

  it("opération prévue exactement maintenant : pas encore en retard", () => {
    expect(compterParStatut([op("1", "Planifiée", new Date(MAINTENANT))], MAINTENANT).retardees).toBe(0);
  });
});

describe("operationsEnRetard", () => {
  it("les cinq premières dans l'ordre reçu, présentées avec le statut « Retardée »", () => {
    const operations = [
      op("1", "Planifiée", PASSE),
      op("2", "Terminée", PASSE),
      op("3", "En route", PASSE),
      op("4", "Retardée", FUTUR),
      op("5", "Planifiée", FUTUR),
      op("6", "Affectée", PASSE),
      op("7", "En cours", PASSE),
      op("8", "Planifiée", PASSE),
      op("9", "Planifiée", PASSE),
    ];
    expect(operationsEnRetard(operations, MAINTENANT)).toEqual([
      { id: "1", natureIntervention: "Nature 1", dateHeurePrevue: PASSE, statut: "Retardée" },
      { id: "3", natureIntervention: "Nature 3", dateHeurePrevue: PASSE, statut: "Retardée" },
      { id: "4", natureIntervention: "Nature 4", dateHeurePrevue: FUTUR, statut: "Retardée" },
      { id: "6", natureIntervention: "Nature 6", dateHeurePrevue: PASSE, statut: "Retardée" },
      { id: "7", natureIntervention: "Nature 7", dateHeurePrevue: PASSE, statut: "Retardée" },
    ]);
  });

  it("aucune opération en retard : liste vide", () => {
    expect(operationsEnRetard([op("1", "Annulée", PASSE), op("2", "Planifiée", FUTUR)], MAINTENANT)).toEqual([]);
  });
});

describe("bornesDuJour", () => {
  it("de 00:00:00.000 à 23:59:59.999, heure locale, sans modifier l'instant fourni", () => {
    const instant = new Date(2030, 10, 4, 12, 34, 56, 789);
    expect(bornesDuJour(instant)).toEqual({
      debut: new Date(2030, 10, 4, 0, 0, 0, 0),
      fin: new Date(2030, 10, 4, 23, 59, 59, 999),
    });
    expect(instant).toEqual(new Date(2030, 10, 4, 12, 34, 56, 789));
  });
});
