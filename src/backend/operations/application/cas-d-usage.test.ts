// src/backend/operations/application/cas-d-usage.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import type { Acteur } from "@/shared/acces/acteur";
import type { ConflictResult, DemandeAffectation } from "../domain/conflits";
import { ChauffeurSansEquipe, ConflitAffectation, OperationIntrouvable } from "../domain/erreurs";
import type { Operation, OperationSaisie } from "../domain/operation";
import { OperationRepositoryEnMemoire } from "../infrastructure/en-memoire/operation.repository.en-memoire";
import { creerCasDUsageOperations } from "./cas-d-usage";

const MAINTENANT = new Date("2030-11-01T12:00:00.000Z");
const PAGE = { skip: 0, limit: 20 };

const admin: Acteur = { id: "u-admin", role: "admin" };
const compteClient: Acteur = { id: "u-client", role: "client", clientId: "client-a" };
const chauffeur: Acteur = { id: "u-chauffeur", role: "chauffeur", equipeId: "equipe-a" };
const chauffeurSansEquipe: Acteur = { id: "u-chauffeur", role: "chauffeur" };

const saisie = (surcharge: Partial<OperationSaisie> = {}): OperationSaisie => ({
  clientId: "client-a",
  siteId: "site-a",
  natureIntervention: "Collecte",
  dateHeurePrevue: new Date("2030-11-02T10:00:00.000Z"),
  dureeEstimeeMinutes: 90,
  equipementIds: [],
  informationsParticulieres: "",
  uniteQuantite: "Litres",
  remarquesTerrain: "",
  nomSignataireClient: "",
  signatureClient: "",
  ...surcharge,
});

const CONFLIT: ConflictResult = {
  hasConflict: true,
  message: "L'équipe est déjà affectée à une opération sur ce créneau",
  conflictingOperationId: "operation-9",
};

describe("cas d'usage des opérations", () => {
  let operations: OperationRepositoryEnMemoire;
  let demandes: DemandeAffectation[];
  let conflits: ConflictResult[];
  let casDUsage: ReturnType<typeof creerCasDUsageOperations>;

  const deposer = (surcharge: Partial<Operation>): Operation => {
    const operation: Operation = {
      id: "operation-x",
      clientId: "client-a",
      siteId: "site-a",
      natureIntervention: "Collecte",
      dateHeurePrevue: new Date("2030-11-02T10:00:00.000Z"),
      dureeEstimeeMinutes: 120,
      equipementIds: [],
      informationsParticulieres: "",
      statut: "Planifiée",
      historiqueStatuts: [],
      uniteQuantite: "Litres",
      remarquesTerrain: "",
      nomSignataireClient: "",
      signatureClient: "",
      photos: [],
      rapportPdf: "",
      ...surcharge,
    };
    operations.deposer(operation);
    return operation;
  };

  beforeEach(() => {
    operations = new OperationRepositoryEnMemoire();
    demandes = [];
    conflits = [];
    casDUsage = creerCasDUsageOperations({
      operations,
      verifierConflits: async (demande) => {
        demandes.push(demande);
        return conflits;
      },
      horloge: { maintenant: () => MAINTENANT },
    });
  });

  describe("verifierAccesLecture", () => {
    it("refuse un chauffeur sans équipe, laisse passer les autres", () => {
      expect(() => casDUsage.verifierAccesLecture(chauffeurSansEquipe)).toThrow(ChauffeurSansEquipe);
      expect(() => casDUsage.verifierAccesLecture(chauffeurSansEquipe)).toThrow("Compte chauffeur sans équipe attribuée");
      for (const acteur of [admin, compteClient, chauffeur]) {
        expect(() => casDUsage.verifierAccesLecture(acteur)).not.toThrow();
      }
    });
  });

  describe("lister", () => {
    it("un chauffeur sans équipe est refusé avant toute lecture", async () => {
      await expect(casDUsage.lister(chauffeurSansEquipe, {}, PAGE)).rejects.toThrow(ChauffeurSansEquipe);
      expect(operations.filtresRecus).toHaveLength(0);
    });

    it("un rôle interne garde les filtres demandés", async () => {
      await casDUsage.lister(admin, { clientId: "client-b", equipeId: "equipe-b", statut: "Affectée" }, PAGE);
      expect(operations.filtresRecus).toEqual([{ clientId: "client-b", equipeId: "equipe-b", statut: "Affectée" }]);
    });

    it("le périmètre d'un compte client écrase le client demandé", async () => {
      await casDUsage.lister(compteClient, { clientId: "client-b", statut: "Affectée" }, PAGE);
      expect(operations.filtresRecus).toEqual([{ clientId: "client-a", statut: "Affectée" }]);
    });

    it("le périmètre d'un chauffeur écrase l'équipe demandée", async () => {
      await casDUsage.lister(chauffeur, { equipeId: "equipe-b" }, PAGE);
      expect(operations.filtresRecus).toEqual([{ equipeId: "equipe-a" }]);
    });

    it("renvoie les éléments et le total du dépôt", async () => {
      deposer({ id: "operation-1" });
      deposer({ id: "operation-2", clientId: "client-b" });
      const resultat = await casDUsage.lister(compteClient, {}, PAGE);
      expect(resultat.items.map((o) => o.id)).toEqual(["operation-1"]);
      expect(resultat.total).toBe(1);
    });
  });

  describe("obtenir", () => {
    it("introuvable : OperationIntrouvable « Non trouvé »", async () => {
      await expect(casDUsage.obtenir(admin, "absente")).rejects.toThrow(OperationIntrouvable);
      await expect(casDUsage.obtenir(admin, "absente")).rejects.toThrow("Non trouvé");
    });

    it("chauffeur sans équipe : refusé avant la lecture", async () => {
      deposer({ id: "operation-1" });
      await expect(casDUsage.obtenir(chauffeurSansEquipe, "operation-1")).rejects.toThrow(ChauffeurSansEquipe);
    });

    it("relations peuplées : le périmètre se lit sur l'identifiant de la relation", async () => {
      deposer({
        id: "operation-1",
        clientId: { id: "client-a", nom: "Client A" },
        equipeId: { id: "equipe-a", nom: "Équipe A" },
      });
      expect((await casDUsage.obtenir(compteClient, "operation-1")).id).toBe("operation-1");
      expect((await casDUsage.obtenir(chauffeur, "operation-1")).id).toBe("operation-1");
      expect((await casDUsage.obtenir(admin, "operation-1")).id).toBe("operation-1");
    });

    it.each([
      ["autre client", compteClient, { clientId: "client-b" }],
      ["client supprimé (référence pendante)", compteClient, { clientId: null }],
      ["autre équipe", chauffeur, { equipeId: "equipe-b" }],
      ["opération sans équipe", chauffeur, {}],
      ["équipe supprimée (référence pendante)", chauffeur, { equipeId: null }],
    ] as const)("hors périmètre (%s) : indiscernable d'une opération inexistante", async (_cas, acteur, surcharge) => {
      deposer({ id: "operation-1", ...surcharge });
      await expect(casDUsage.obtenir(acteur, "operation-1")).rejects.toThrow(OperationIntrouvable);
    });
  });

  describe("creer", () => {
    it.each([
      [{ equipeId: "equipe-a", vehiculeId: "vehicule-a" }, "Affectée"],
      [{ equipeId: "equipe-a" }, "Planifiée"],
      [{ vehiculeId: "vehicule-a" }, "Planifiée"],
      [{}, "Planifiée"],
      [{ equipeId: "", vehiculeId: "vehicule-a" }, "Planifiée"],
    ] as const)("statut initial pour %j : %s", async (ressources, attendu) => {
      const operation = await casDUsage.creer(admin, saisie(ressources));
      expect(operation.statut).toBe(attendu);
    });

    it("première entrée d'historique : statut initial, heure de l'horloge, acteur", async () => {
      const operation = await casDUsage.creer(admin, saisie({ equipeId: "equipe-a", vehiculeId: "vehicule-a" }));
      expect(operation.historiqueStatuts).toEqual([{ statut: "Affectée", date: MAINTENANT, parUtilisateur: "u-admin" }]);
    });

    it("le statut de la saisie est ignoré", async () => {
      expect((await casDUsage.creer(admin, saisie({ statut: "Terminée" }))).statut).toBe("Planifiée");
    });

    it("demande de conflit : créneau et ressources de la saisie, sans opération à exclure", async () => {
      await casDUsage.creer(admin, saisie({ equipeId: "equipe-a", vehiculeId: "vehicule-a" }));
      expect(demandes).toEqual([
        {
          dateHeurePrevue: new Date("2030-11-02T10:00:00.000Z"),
          dureeEstimeeMinutes: 90,
          equipeId: "equipe-a",
          vehiculeId: "vehicule-a",
        },
      ]);
    });

    it("conflit : ConflitAffectation porte les conflits, rien n'est créé", async () => {
      conflits = [CONFLIT];
      const tentative = casDUsage.creer(admin, saisie({ equipeId: "equipe-a" }));
      await expect(tentative).rejects.toThrow(ConflitAffectation);
      await expect(tentative).rejects.toMatchObject({ message: "Conflit d'affectation", conflits: [CONFLIT] });
      expect((await casDUsage.lister(admin, {}, PAGE)).total).toBe(0);
    });

    it("un résultat sans conflit effectif ne bloque pas", async () => {
      conflits = [{ hasConflict: false }];
      await expect(casDUsage.creer(admin, saisie())).resolves.toMatchObject({ statut: "Planifiée" });
    });
  });

  describe("modifier", () => {
    it("exclut l'opération elle-même de la recherche de conflits", async () => {
      deposer({ id: "operation-1" });
      await casDUsage.modifier("operation-1", saisie({ equipeId: "equipe-a" }));
      expect(demandes).toEqual([
        {
          dateHeurePrevue: new Date("2030-11-02T10:00:00.000Z"),
          dureeEstimeeMinutes: 90,
          equipeId: "equipe-a",
          vehiculeId: undefined,
          excludeOperationId: "operation-1",
        },
      ]);
    });

    it("le conflit est signalé avant de savoir si l'opération existe", async () => {
      conflits = [CONFLIT];
      await expect(casDUsage.modifier("absente", saisie({ equipeId: "equipe-a" }))).rejects.toThrow(ConflitAffectation);
    });

    it("introuvable : OperationIntrouvable", async () => {
      await expect(casDUsage.modifier("absente", saisie())).rejects.toThrow(OperationIntrouvable);
    });

    it("renvoie l'opération modifiée ; le statut n'est pas recalculé", async () => {
      deposer({ id: "operation-1", statut: "Planifiée" });
      const operation = await casDUsage.modifier(
        "operation-1",
        saisie({ natureIntervention: "Modifiée", equipeId: "equipe-a", vehiculeId: "vehicule-a" })
      );
      expect(operation).toMatchObject({ id: "operation-1", natureIntervention: "Modifiée", statut: "Planifiée" });
    });
  });

  describe("supprimer", () => {
    it("supprime, puis OperationIntrouvable", async () => {
      deposer({ id: "operation-1" });
      await expect(casDUsage.supprimer("operation-1")).resolves.toBeUndefined();
      await expect(casDUsage.supprimer("operation-1")).rejects.toThrow(OperationIntrouvable);
    });
  });

  describe("planning", () => {
    it("un chauffeur sans équipe est refusé", async () => {
      await expect(casDUsage.planning(chauffeurSansEquipe, {})).rejects.toThrow(ChauffeurSansEquipe);
    });

    it("applique le périmètre et les bornes de date demandées", async () => {
      const dateDebut = new Date("2030-11-01T00:00:00.000Z");
      await casDUsage.planning(chauffeur, { dateDebut });
      await casDUsage.planning(compteClient, {});
      expect(operations.filtresRecus).toEqual([{ dateDebut, equipeId: "equipe-a" }, { clientId: "client-a" }]);
    });

    it("statut effectif selon l'horloge, fin = début + durée", async () => {
      deposer({ id: "passee", dateHeurePrevue: new Date("2030-11-01T11:59:59.999Z"), dureeEstimeeMinutes: 30 });
      deposer({ id: "maintenant", dateHeurePrevue: new Date(MAINTENANT) });
      deposer({ id: "terminee", dateHeurePrevue: new Date("2030-10-01T10:00:00.000Z"), statut: "Terminée" });

      const elements = await casDUsage.planning(admin, {});
      const parId = Object.fromEntries(elements.map((e) => [e.operation.id, e]));

      expect(parId.passee.statutEffectif).toBe("Retardée");
      expect(parId.passee.fin).toEqual(new Date("2030-11-01T12:29:59.999Z"));
      expect(parId.maintenant.statutEffectif).toBe("Planifiée");
      expect(parId.maintenant.fin).toEqual(new Date("2030-11-01T14:00:00.000Z"));
      expect(parId.terminee.statutEffectif).toBe("Terminée");
      expect(parId.passee.operation.statut).toBe("Planifiée");
    });
  });
});
