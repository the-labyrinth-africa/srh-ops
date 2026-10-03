import { describe, it, expect, beforeEach } from "vitest";
import type { OperationDuJour, OperationSuivie } from "../domain/statistiques";
import { creerCasDUsagePilotage } from "./cas-d-usage";

const MAINTENANT = new Date(2030, 10, 4, 12, 0, 0, 0);
const PASSE = new Date(2030, 10, 2, 10, 0);
const FUTUR = new Date(2030, 10, 9, 10, 0);

describe("cas d'usage du pilotage", () => {
  let suivies: OperationSuivie[];
  let duJour: OperationDuJour[];
  let demandes: { debut: Date; fin: Date; avecEquipe: boolean }[];
  let casDUsage: ReturnType<typeof creerCasDUsagePilotage>;

  beforeEach(() => {
    suivies = [
      { id: "1", natureIntervention: "En retard", dateHeurePrevue: PASSE, statut: "Planifiée" },
      { id: "2", natureIntervention: "À venir", dateHeurePrevue: FUTUR, statut: "Affectée" },
      { id: "3", natureIntervention: "Finie", dateHeurePrevue: PASSE, statut: "Terminée" },
    ];
    duJour = [{ _id: "op-jour", natureIntervention: "Du jour", dateHeurePrevue: MAINTENANT, statut: "En cours" }];
    demandes = [];
    casDUsage = creerCasDUsagePilotage({
      statistiques: {
        operationsSuivies: async () => suivies,
        compterClientsEtSites: async () => ({ totalClients: 4, totalSites: 9 }),
        operationsDuJour: async (debut, fin, { avecEquipe }) => {
          demandes.push({ debut, fin, avecEquipe });
          return duJour;
        },
      },
      horloge: { maintenant: () => MAINTENANT },
    });
  });

  const journee = { debut: new Date(2030, 10, 4, 0, 0, 0, 0), fin: new Date(2030, 10, 4, 23, 59, 59, 999) };

  it("statistiques : compteurs complets, opérations du jour avec équipe, opérations en retard", async () => {
    expect(await casDUsage.statistiques()).toEqual({
      stats: { prevues: 1, enCours: 0, terminees: 1, retardees: 1, annulees: 0, totalClients: 4, totalSites: 9 },
      todayOps: duJour,
      delayedOps: [{ id: "1", natureIntervention: "En retard", dateHeurePrevue: PASSE, statut: "Retardée" }],
    });
    expect(demandes).toEqual([{ ...journee, avecEquipe: true }]);
  });

  it("tableau de bord de la direction : quatre compteurs, opérations du jour sans équipe, totaux", async () => {
    expect(await casDUsage.tableauDeBord()).toEqual({
      stats: { prevues: 1, enCours: 0, terminees: 1, retardees: 1 },
      todayOps: duJour,
      totalClients: 4,
      totalSites: 9,
    });
    expect(demandes).toEqual([{ ...journee, avecEquipe: false }]);
  });
});
