import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Acteur } from "@/shared/acces/acteur";
import {
  ChauffeurSansEquipe,
  OperationIntrouvable,
  RapportOperationNonTerminee,
} from "../domain/erreurs";
import type { Operation } from "../domain/operation";
import { creerCasDUsageRapport } from "./cas-d-usage-rapport";

const MAINTENANT = new Date("2030-11-05T09:00:00.000Z");
const PDF = new Uint8Array([37, 80, 68, 70]);
const admin: Acteur = { id: "u-admin", role: "admin" };

const operation = {
  id: "6ac0f07a0086aca5b0ced976",
  natureIntervention: "Collecte",
  statut: "Terminée",
} as Operation;

describe("cas d'usage : rapport d'intervention", () => {
  let appels: { operation: Operation; genereLe: Date }[];
  let lectures: { acteur: Acteur; id: string }[];
  let erreurDeLecture: Error | null;
  let casDUsage: ReturnType<typeof creerCasDUsageRapport>;

  beforeEach(() => {
    appels = [];
    lectures = [];
    erreurDeLecture = null;
    casDUsage = creerCasDUsageRapport({
      obtenir: async (acteur, id) => {
        lectures.push({ acteur, id });
        if (erreurDeLecture) throw erreurDeLecture;
        return operation;
      },
      generateur: {
        generer: async (op, genereLe) => {
          appels.push({ operation: op, genereLe });
          return PDF;
        },
      },
      horloge: { maintenant: () => MAINTENANT },
    });
  });

  it("lit l'opération pour l'acteur, puis la transmet au générateur avec la date de l'horloge", async () => {
    const rapport = await casDUsage.generer(admin, operation.id);

    expect(lectures).toEqual([{ acteur: admin, id: operation.id }]);
    expect(appels).toEqual([{ operation, genereLe: MAINTENANT }]);
    expect(rapport.contenu).toBe(PDF);
  });

  it("nom de fichier : rapport-<référence>.pdf", async () => {
    expect((await casDUsage.generer(admin, operation.id)).nomFichier).toBe("rapport-B0CED976.pdf");
  });

  it.each([
    ["introuvable ou hors périmètre", new OperationIntrouvable()],
    ["chauffeur sans équipe", new ChauffeurSansEquipe()],
  ])("lecture refusée (%s) : l'erreur remonte, aucun PDF n'est généré", async (_cas, erreur) => {
    erreurDeLecture = erreur;
    await expect(casDUsage.generer(admin, operation.id)).rejects.toBe(erreur);
    expect(appels).toHaveLength(0);
  });

  describe("envoyerParEmail", () => {
    it("lève EmailClientManquant si aucun e-mail n'est fourni ni renseigné sur le client", async () => {
      await expect(casDUsage.envoyerParEmail(admin, operation.id)).rejects.toThrow("Aucune adresse e-mail trouvée");
    });

    it("envoie le rapport par e-mail au client et transitionne vers Rapportée si Terminée", async () => {
      const messagesEnvoyes: unknown[] = [];
      const transitionsStatut: unknown[] = [];

      const casAvecMail = creerCasDUsageRapport({
        obtenir: async () => ({
          ...operation,
          statut: "Terminée",
          clientId: { id: "c1", nom: "Client SARL", contact: { email: "contact@client.ci" } },
          siteId: { id: "s1", nom: "Usine Vridi" },
        } as unknown as Operation),
        generateur: {
          generer: async () => PDF,
        },
        horloge: { maintenant: () => MAINTENANT },
        envoiEmail: {
          envoyer: async (msg) => {
            messagesEnvoyes.push(msg);
            return { ok: true };
          },
        },
        changerStatut: async (id, chg) => {
          transitionsStatut.push({ id, chg });
          return null;
        },
      });

      const res = await casAvecMail.envoyerParEmail(admin, operation.id);
      expect(res).toEqual({
        ok: true,
        destinataire: "contact@client.ci",
        nomFichier: "rapport-B0CED976.pdf",
      });
      expect(messagesEnvoyes).toHaveLength(1);
      expect(messagesEnvoyes[0]).toMatchObject({
        destinataire: "contact@client.ci",
        sujet: expect.stringContaining("Rapport d'intervention #B0CED976"),
      });
      expect(transitionsStatut).toHaveLength(1);
      expect(transitionsStatut[0]).toMatchObject({
        id: operation.id,
        chg: { statut: "Rapportée", ancienStatut: "Terminée" },
      });
    });

    it("refuse l'envoi avant la fin de l'intervention", async () => {
      const envoyer = { envoyer: vi.fn() };
      const casAvecMail = creerCasDUsageRapport({
        obtenir: async () => ({
          ...operation,
          statut: "Planifiée",
          clientId: { id: "c1", nom: "Client SARL", contact: { email: "contact@client.ci" } },
        } as unknown as Operation),
        generateur: { generer: async () => PDF },
        horloge: { maintenant: () => MAINTENANT },
        envoiEmail: envoyer,
      });

      await expect(casAvecMail.envoyerParEmail(admin, operation.id)).rejects.toBeInstanceOf(
        RapportOperationNonTerminee
      );
      expect(envoyer.envoyer).not.toHaveBeenCalled();
    });
  });
});
