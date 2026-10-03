// src/backend/operations/http/presentation.test.ts
import { describe, it, expect } from "vitest";
import type { Operation } from "../domain/operation";
import { versEvenementPlanning, versReponseOperation } from "./presentation";

const DATE = new Date("2030-11-01T10:00:00.000Z");

const operation = (surcharge: Partial<Operation> = {}): Operation => ({
  id: "op-1",
  clientId: { id: "client-a", nom: "Client A" },
  siteId: { id: "site-a", nom: "Site A", adresse: "Rue 1" },
  natureIntervention: "Collecte",
  dateHeurePrevue: DATE,
  dureeEstimeeMinutes: 120,
  equipementIds: ["equipement-a"],
  informationsParticulieres: "",
  statut: "Planifiée",
  historiqueStatuts: [{ statut: "Planifiée", date: DATE, parUtilisateur: "u-1" }],
  uniteQuantite: "Litres",
  remarquesTerrain: "",
  nomSignataireClient: "",
  signatureClient: "",
  photos: [],
  rapportPdf: "",
  createdAt: DATE,
  updatedAt: DATE,
  revision: 0,
  ...surcharge,
});

describe("versReponseOperation", () => {
  it("restitue la forme JSON historique : `_id`, `__v`, relations peuplées sous `_id`", () => {
    expect(JSON.parse(JSON.stringify(versReponseOperation(operation())))).toEqual({
      _id: "op-1",
      clientId: { _id: "client-a", nom: "Client A" },
      siteId: { _id: "site-a", nom: "Site A", adresse: "Rue 1" },
      natureIntervention: "Collecte",
      dateHeurePrevue: "2030-11-01T10:00:00.000Z",
      dureeEstimeeMinutes: 120,
      equipementIds: ["equipement-a"],
      informationsParticulieres: "",
      statut: "Planifiée",
      historiqueStatuts: [{ statut: "Planifiée", date: "2030-11-01T10:00:00.000Z", parUtilisateur: "u-1" }],
      uniteQuantite: "Litres",
      remarquesTerrain: "",
      nomSignataireClient: "",
      signatureClient: "",
      rapportPdf: "",
      photos: [],
      createdAt: "2030-11-01T10:00:00.000Z",
      updatedAt: "2030-11-01T10:00:00.000Z",
      __v: 0,
    });
  });

  it("relation pendante : null JSON ; relation jamais affectée : clé absente", () => {
    const json = JSON.parse(JSON.stringify(versReponseOperation(operation({ clientId: null, equipeId: null }))));
    expect(json.clientId).toBeNull();
    expect(json.equipeId).toBeNull();
    expect(json).not.toHaveProperty("vehiculeId");
    expect(json).not.toHaveProperty("quantiteCollectee");
  });

  it("niveau détail : équipements et auteur d'historique peuplés, ancien statut conservé", () => {
    const json = JSON.parse(
      JSON.stringify(
        versReponseOperation(
          operation({
            equipementIds: [{ id: "equipement-a", nom: "Pompe", type: "Pompage" }],
            historiqueStatuts: [
              { statut: "Affectée", date: DATE, parUtilisateur: { id: "u-1", nom: "Admin Ops" } },
              { statut: "En route", date: DATE, parUtilisateur: null, ancienStatut: "Affectée" },
              { statut: "En cours", date: DATE },
            ],
            quantiteCollectee: 12,
            photos: [{ url: "data:image/jpeg;base64,BBBB", nom: "cuve.jpg", uploadedAt: DATE }],
          })
        )
      )
    );
    expect(json.equipementIds).toEqual([{ _id: "equipement-a", nom: "Pompe", type: "Pompage" }]);
    expect(json.historiqueStatuts).toEqual([
      { statut: "Affectée", date: "2030-11-01T10:00:00.000Z", parUtilisateur: { _id: "u-1", nom: "Admin Ops" } },
      { statut: "En route", date: "2030-11-01T10:00:00.000Z", parUtilisateur: null, ancienStatut: "Affectée" },
      { statut: "En cours", date: "2030-11-01T10:00:00.000Z" },
    ]);
    expect(json.quantiteCollectee).toBe(12);
    expect(json.photos).toEqual([
      { url: "data:image/jpeg;base64,BBBB", nom: "cuve.jpg", uploadedAt: "2030-11-01T10:00:00.000Z" },
    ]);
  });
});

describe("versEvenementPlanning", () => {
  const FIN = new Date("2030-11-01T12:00:00.000Z");

  it("événement complet", () => {
    const element = {
      operation: operation({
        equipeId: { id: "equipe-a", nom: "Équipe A" },
        vehiculeId: { id: "vehicule-a", identification: "V-001" },
      }),
      statutEffectif: "Retardée" as const,
      fin: FIN,
    };
    expect(JSON.parse(JSON.stringify(versEvenementPlanning(element)))).toEqual({
      id: "op-1",
      title: "Client A — Collecte",
      start: "2030-11-01T10:00:00.000Z",
      end: "2030-11-01T12:00:00.000Z",
      backgroundColor: "#E65100",
      borderColor: "#E65100",
      extendedProps: { statut: "Retardée", site: "Site A", equipe: "Équipe A", vehicule: "V-001" },
    });
  });

  it("client pendant ou non peuplé : « Client » ; relations manquantes : clés absentes", () => {
    for (const clientId of [null, "client-a"]) {
      const json = JSON.parse(
        JSON.stringify(
          versEvenementPlanning({ operation: operation({ clientId, siteId: null }), statutEffectif: "Planifiée", fin: FIN })
        )
      );
      expect(json.title).toBe("Client — Collecte");
      expect(json.extendedProps).toEqual({ statut: "Planifiée" });
    }
  });

  it.each([
    ["Planifiée", "#546E7A"],
    ["Affectée", "#3949AB"],
    ["En route", "#FB8C00"],
    ["En cours", "#1976D2"],
    ["Terminée", "#2E7D32"],
    ["Rapportée", "#1B5E20"],
    ["Retardée", "#E65100"],
    ["Annulée", "#C62828"],
  ] as const)("couleur de %s : %s", (statutEffectif, couleur) => {
    const evenement = versEvenementPlanning({ operation: operation(), statutEffectif, fin: FIN });
    expect(evenement.backgroundColor).toBe(couleur);
    expect(evenement.borderColor).toBe(couleur);
  });

  it("statut inconnu : couleur de repli historique", () => {
    const evenement = versEvenementPlanning({ operation: operation(), statutEffectif: "Bidon" as never, fin: FIN });
    expect(evenement.backgroundColor).toBe("text-status-planned");
  });
});
