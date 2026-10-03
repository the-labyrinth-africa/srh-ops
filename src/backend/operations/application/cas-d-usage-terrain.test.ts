// src/backend/operations/application/cas-d-usage-terrain.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import type { Acteur } from "@/shared/acces/acteur";
import {
  ChauffeurSansEquipe,
  FormatPhotoInvalide,
  OperationHorsEquipe,
  OperationIntrouvable,
  PhotoRequise,
  PhotosTropLourdes,
  TransitionInterdite,
  TropDePhotos,
  UrlPhotoRequise,
} from "../domain/erreurs";
import type { Operation } from "../domain/operation";
import { OperationRepositoryEnMemoire } from "../infrastructure/en-memoire/operation.repository.en-memoire";
import { creerCasDUsageTerrain } from "./cas-d-usage-terrain";

const MAINTENANT = new Date("2030-11-01T12:00:00.000Z");
const PHOTO = "data:image/jpeg;base64,AAAA";
const photoDe = (octets: number) => "data:image/jpeg;base64,".padEnd(octets, "A");

const admin: Acteur = { id: "u-admin", role: "admin" };
const chauffeur: Acteur = { id: "u-chauffeur", role: "chauffeur", equipeId: "equipe-a" };
const chauffeurSansEquipe: Acteur = { id: "u-chauffeur", role: "chauffeur" };

describe("cas d'usage de terrain", () => {
  let operations: OperationRepositoryEnMemoire;
  let alertes: string[];
  let casDUsage: ReturnType<typeof creerCasDUsageTerrain>;

  const deposer = (surcharge: Partial<Operation> = {}): Operation => {
    const operation: Operation = {
      id: "operation-1",
      clientId: "client-a",
      siteId: "site-a",
      natureIntervention: "Collecte",
      dateHeurePrevue: new Date("2030-11-02T10:00:00.000Z"),
      dureeEstimeeMinutes: 120,
      equipeId: "equipe-a",
      equipementIds: [],
      informationsParticulieres: "",
      statut: "Affectée",
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

  const lue = async () => (await operations.trouverDetailParId("operation-1")) as Operation;

  beforeEach(() => {
    operations = new OperationRepositoryEnMemoire();
    alertes = [];
    casDUsage = creerCasDUsageTerrain({
      operations,
      horloge: { maintenant: () => MAINTENANT },
      alerteCoherence: (message) => alertes.push(message),
    });
  });

  describe("verifierAccesTerrain", () => {
    it("refuse un chauffeur sans équipe, laisse passer les autres", () => {
      expect(() => casDUsage.verifierAccesTerrain(chauffeurSansEquipe)).toThrow(ChauffeurSansEquipe);
      expect(() => casDUsage.verifierAccesTerrain(chauffeur)).not.toThrow();
      expect(() => casDUsage.verifierAccesTerrain(admin)).not.toThrow();
    });
  });

  describe("changerStatut", () => {
    it("chauffeur sans équipe : refusé", async () => {
      deposer();
      await expect(casDUsage.changerStatut(chauffeurSansEquipe, "operation-1", { statut: "En route" })).rejects.toThrow(
        ChauffeurSansEquipe
      );
    });

    it("introuvable : OperationIntrouvable", async () => {
      await expect(casDUsage.changerStatut(admin, "absente", { statut: "En route" })).rejects.toThrow(OperationIntrouvable);
    });

    it.each([
      ["autre équipe", { equipeId: "equipe-b" }],
      ["opération sans équipe", { equipeId: undefined }],
      ["équipe supprimée (référence pendante)", { equipeId: null }],
    ] as const)("chauffeur, %s : OperationHorsEquipe, rien n'est écrit", async (_cas, surcharge) => {
      deposer(surcharge);
      const tentative = casDUsage.changerStatut(chauffeur, "operation-1", { statut: "En route" });
      await expect(tentative).rejects.toThrow(OperationHorsEquipe);
      await expect(tentative).rejects.toThrow("Opération non affectée à votre équipe");
      expect((await lue()).statut).toBe("Affectée");
    });

    it("l'équipe est contrôlée avant la transition", async () => {
      deposer({ equipeId: "equipe-b", statut: "Planifiée" });
      await expect(casDUsage.changerStatut(chauffeur, "operation-1", { statut: "Terminée" })).rejects.toThrow(
        OperationHorsEquipe
      );
    });

    it("transition interdite : TransitionInterdite, message exact, aucune donnée de terrain écrite", async () => {
      deposer({ statut: "Planifiée" });
      const tentative = casDUsage.changerStatut(admin, "operation-1", { statut: "Terminée", remarquesTerrain: "non" });
      await expect(tentative).rejects.toThrow(TransitionInterdite);
      await expect(tentative).rejects.toThrow("Transition Planifiée → Terminée non autorisée");
      expect(await lue()).toMatchObject({ statut: "Planifiée", remarquesTerrain: "", historiqueStatuts: [] });
    });

    it("succès : statut appliqué, entrée d'historique datée par l'horloge et signée par l'acteur", async () => {
      deposer();
      const operation = await casDUsage.changerStatut(chauffeur, "operation-1", { statut: "En route" });
      expect(operation.statut).toBe("En route");
      expect(operation.historiqueStatuts).toEqual([
        { statut: "En route", date: MAINTENANT, parUtilisateur: "u-chauffeur", ancienStatut: "Affectée" },
      ]);
    });

    it("données de terrain transmises au dépôt", async () => {
      deposer({ statut: "En cours" });
      const operation = await casDUsage.changerStatut(admin, "operation-1", {
        statut: "Terminée",
        quantiteCollectee: 12.5,
        uniteQuantite: "Kg",
        remarquesTerrain: "RAS",
        photos: [{ url: PHOTO }],
      });
      expect(operation).toMatchObject({
        statut: "Terminée",
        quantiteCollectee: 12.5,
        uniteQuantite: "Kg",
        remarquesTerrain: "RAS",
        photos: [{ url: PHOTO, nom: "", uploadedAt: MAINTENANT }],
      });
    });

    it("même statut : accepté, entrée d'historique avec l'ancien statut identique", async () => {
      deposer({ statut: "Planifiée" });
      const operation = await casDUsage.changerStatut(admin, "operation-1", { statut: "Planifiée" });
      expect(operation.historiqueStatuts).toEqual([
        { statut: "Planifiée", date: MAINTENANT, parUtilisateur: "u-admin", ancienStatut: "Planifiée" },
      ]);
    });

    it("Terminée sans En cours : acceptée et signalée ; depuis En cours : aucune alerte", async () => {
      deposer({ statut: "Retardée" });
      await casDUsage.changerStatut(admin, "operation-1", { statut: "Terminée" });
      expect(alertes).toEqual(["[cohérence] Opération operation-1 passée Terminée sans En cours (était Retardée)"]);

      deposer({ statut: "En cours" });
      await casDUsage.changerStatut(admin, "operation-1", { statut: "Terminée" });
      expect(alertes).toHaveLength(1);
    });
  });

  describe("ajouterPhoto", () => {
    it("chauffeur sans équipe : refusé", async () => {
      deposer();
      await expect(casDUsage.ajouterPhoto(chauffeurSansEquipe, "operation-1", { photo: PHOTO })).rejects.toThrow(
        ChauffeurSansEquipe
      );
    });

    it("la forme de la photo est contrôlée avant de chercher l'opération", async () => {
      await expect(casDUsage.ajouterPhoto(admin, "absente", {})).rejects.toThrow(PhotoRequise);
      await expect(casDUsage.ajouterPhoto(admin, "absente", { photo: "https://x.ci/p.jpg" })).rejects.toThrow(
        FormatPhotoInvalide
      );
    });

    it("introuvable : OperationIntrouvable", async () => {
      await expect(casDUsage.ajouterPhoto(admin, "absente", { photo: PHOTO })).rejects.toThrow(OperationIntrouvable);
    });

    it("chauffeur d'une autre équipe : OperationHorsEquipe, rien n'est ajouté", async () => {
      deposer({ equipeId: "equipe-b" });
      await expect(casDUsage.ajouterPhoto(chauffeur, "operation-1", { photo: PHOTO })).rejects.toThrow(OperationHorsEquipe);
      expect((await lue()).photos).toEqual([]);
    });

    it("succès : photo nommée, datée par l'horloge, ajoutée à la suite", async () => {
      deposer({ photos: [{ url: `${PHOTO}0`, nom: "a.jpg", uploadedAt: MAINTENANT }] });
      const photo = await casDUsage.ajouterPhoto(chauffeur, "operation-1", { photo: PHOTO, nom: "cuve.jpg" });
      expect(photo).toEqual({ url: PHOTO, nom: "cuve.jpg", uploadedAt: MAINTENANT });
      expect((await lue()).photos.map((p) => p.nom)).toEqual(["a.jpg", "cuve.jpg"]);
    });

    it.each([undefined, ""])("nom %j : « photo-<horodatage>.jpg »", async (nom) => {
      deposer();
      const photo = await casDUsage.ajouterPhoto(admin, "operation-1", { photo: PHOTO, nom });
      expect(photo.nom).toBe(`photo-${MAINTENANT.getTime()}.jpg`);
    });

    it("dix photos : TropDePhotos, rien n'est ajouté", async () => {
      deposer({
        photos: Array.from({ length: 10 }, (_, i) => ({ url: `${PHOTO}${i}`, nom: `p${i}.jpg`, uploadedAt: MAINTENANT })),
      });
      await expect(casDUsage.ajouterPhoto(admin, "operation-1", { photo: PHOTO })).rejects.toThrow(TropDePhotos);
      expect((await lue()).photos).toHaveLength(10);
    });

    it("poids cumulé dépassé : PhotosTropLourdes", async () => {
      deposer({
        photos: [1, 2, 3, 4].map((n) => ({ url: photoDe(2 * 1024 * 1024), nom: `p${n}.jpg`, uploadedAt: MAINTENANT })),
      });
      await expect(casDUsage.ajouterPhoto(admin, "operation-1", { photo: PHOTO })).rejects.toThrow(PhotosTropLourdes);
    });
  });

  describe("retirerPhoto", () => {
    it.each([undefined, ""])("URL %j : UrlPhotoRequise, avant de chercher l'opération", async (url) => {
      await expect(casDUsage.retirerPhoto(admin, "absente", url)).rejects.toThrow(UrlPhotoRequise);
    });

    it("introuvable : OperationIntrouvable", async () => {
      await expect(casDUsage.retirerPhoto(admin, "absente", PHOTO)).rejects.toThrow(OperationIntrouvable);
    });

    it("chauffeur d'une autre équipe : OperationHorsEquipe, la photo reste", async () => {
      deposer({ equipeId: "equipe-b", photos: [{ url: PHOTO, nom: "a.jpg", uploadedAt: MAINTENANT }] });
      await expect(casDUsage.retirerPhoto(chauffeur, "operation-1", PHOTO)).rejects.toThrow(OperationHorsEquipe);
      expect((await lue()).photos).toHaveLength(1);
    });

    it("retire la photo ; une URL inconnue réussit sans effet", async () => {
      deposer({ photos: [{ url: PHOTO, nom: "a.jpg", uploadedAt: MAINTENANT }] });
      await expect(casDUsage.retirerPhoto(chauffeur, "operation-1", "data:image/jpeg;base64,INCONNUE")).resolves.toBeUndefined();
      expect((await lue()).photos).toHaveLength(1);
      await casDUsage.retirerPhoto(chauffeur, "operation-1", PHOTO);
      expect((await lue()).photos).toEqual([]);
    });
  });
});
