import { describe, it, expect, beforeEach } from "vitest";
import { AucuneLigneExploitable, ClientIntrouvable } from "../domain/erreurs";
import type { LectureClasseur } from "../domain/lecture";
import type { CollecteImportee } from "../domain/ports";
import { creerCasDUsageImport } from "./cas-d-usage";

const J11 = new Date(2026, 5, 11);
const J19 = new Date(2026, 5, 19);
const huitHeures = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 8, 0, 0, 0);

const lecture = (rows: LectureClasseur["rows"], errors: LectureClasseur["errors"] = []): LectureClasseur => ({
  rows,
  skippedRows: 0,
  errors,
  fileName: "recap.xlsx",
});

describe("cas d'usage de l'import", () => {
  let aLire: LectureClasseur;
  let lectures: { taille: number; nomFichier: string }[];
  let sitesExistants: Map<string, string>;
  let recherches: string[];
  let sitesCrees: Record<string, unknown>[];
  let collectes: CollecteImportee[];
  let casDUsage: ReturnType<typeof creerCasDUsageImport>;

  beforeEach(() => {
    aLire = lecture([{ site: "pmc", date: J11, quantite: 200, rowNumber: 2 }]);
    lectures = [];
    sitesExistants = new Map();
    recherches = [];
    sitesCrees = [];
    collectes = [];
    casDUsage = creerCasDUsageImport({
      lecteur: {
        lire: async (contenu, nomFichier) => {
          lectures.push({ taille: contenu.length, nomFichier });
          return aLire;
        },
      },
      sites: {
        identifiantDuClient: async (clientId) => (clientId === "CLIENT-A" || clientId === "client-a" ? "client-a" : null),
        trouverParNom: async (clientId, nom) => {
          recherches.push(`${clientId}:${nom}`);
          return sitesExistants.get(nom.toLowerCase()) ?? null;
        },
        creer: async (site) => {
          sitesCrees.push(site);
          const id = `site-${sitesCrees.length}`;
          sitesExistants.set(site.nom.toLowerCase(), id);
          return id;
        },
      },
      collectes: {
        existe: async (siteId, date, quantite) =>
          collectes.some(
            (c) => c.siteId === siteId && c.dateHeurePrevue.getTime() === date.getTime() && c.quantiteCollectee === quantite
          ),
        enregistrer: async (collecte) => {
          collectes.push(collecte);
        },
      },
    });
  });

  describe("analyser", () => {
    it("lit le classeur et renvoie la lecture avec son résumé", async () => {
      const analyse = await casDUsage.analyser(new Uint8Array(42), "recap.xlsx");

      expect(lectures).toEqual([{ taille: 42, nomFichier: "recap.xlsx" }]);
      expect(analyse.lecture).toBe(aLire);
      expect(analyse.resume).toMatchObject({ fileName: "recap.xlsx", totalRows: 1, uniqueSites: 1, totalQuantite: 200 });
    });

    it("aucune ligne exploitable : AucuneLigneExploitable porte le premier message et la liste des erreurs", async () => {
      const erreurs = [{ row: 0, message: "Aucune feuille de calcul trouvée." }];
      aLire = lecture([], erreurs);
      const tentative = casDUsage.analyser(new Uint8Array(1), "recap.xlsx");
      await expect(tentative).rejects.toThrow(AucuneLigneExploitable);
      await expect(tentative).rejects.toMatchObject({ message: "Aucune feuille de calcul trouvée.", erreurs });

      aLire = lecture([]);
      await expect(casDUsage.analyser(new Uint8Array(1), "recap.xlsx")).rejects.toThrow(
        "Aucune ligne exploitable détectée dans le fichier."
      );
    });
  });

  describe("importer", () => {
    it("client inconnu : ClientIntrouvable, rien n'est cherché ni créé", async () => {
      await expect(casDUsage.importer(aLire, "client-x", "Collecte")).rejects.toThrow(ClientIntrouvable);
      await expect(casDUsage.importer(aLire, "client-x", "Collecte")).rejects.toThrow("Client introuvable.");
      expect(recherches).toEqual([]);
      expect(collectes).toEqual([]);
    });

    it("crée le site manquant et la collecte, avec les valeurs d'un import", async () => {
      const resultat = await casDUsage.importer(aLire, "CLIENT-A", "Vidange");

      expect(resultat).toEqual({ created: 1, duplicates: 0, clientId: "client-a" });
      expect(sitesCrees).toEqual([
        {
          clientId: "client-a",
          nom: "pmc",
          adresse: "",
          localisation: { lat: 0, lng: 0 },
          typeDechets: ["Huiles usagées"],
          observations: "Importé depuis un fichier Excel",
        },
      ]);
      const prevue = huitHeures(J11);
      expect(collectes).toEqual([
        {
          clientId: "client-a",
          siteId: "site-1",
          natureIntervention: "Vidange",
          dateHeurePrevue: prevue,
          dureeEstimeeMinutes: 120,
          informationsParticulieres: "",
          statut: "Rapportée",
          historiqueStatuts: expect.arrayContaining([{ statut: "Rapportée", date: new Date(prevue.getTime() + 180 * 60_000) }]),
          quantiteCollectee: 200,
          uniteQuantite: "Litres",
          remarquesTerrain: "Intervention importée depuis un fichier Excel",
        },
      ]);
      expect(collectes[0].historiqueStatuts).toHaveLength(6);
    });

    it("site existant du client : réutilisé, aucune création de site", async () => {
      sitesExistants.set("pmc", "site-existant");
      await casDUsage.importer(aLire, "client-a", "Collecte");
      expect(sitesCrees).toEqual([]);
      expect(collectes[0].siteId).toBe("site-existant");
    });

    it("chaque nom de site lu est résolu une fois ; les noms sont comparés sans casse ni espaces autour", async () => {
      aLire = lecture([
        { site: "pmc", date: J11, quantite: 200, rowNumber: 2 },
        { site: "pmc", date: J19, quantite: 300, rowNumber: 3 },
        { site: "angre", date: J11, quantite: 50, rowNumber: 4 },
      ]);

      const resultat = await casDUsage.importer(aLire, "client-a", "Collecte");

      expect(resultat).toMatchObject({ created: 3, duplicates: 0 });
      expect(recherches).toEqual(["client-a:pmc", "client-a:angre"]);
      expect(sitesCrees.map((s) => s.nom)).toEqual(["pmc", "angre"]);
      expect(collectes.map((c) => c.siteId)).toEqual(["site-1", "site-1", "site-2"]);
    });

    it("collecte déjà enregistrée (même site, même date, même quantité) : comptée en doublon", async () => {
      aLire = lecture([
        { site: "pmc", date: J11, quantite: 200, rowNumber: 2 },
        { site: "pmc", date: J11, quantite: 200, rowNumber: 3 },
        { site: "pmc", date: J11, quantite: 201, rowNumber: 4 },
      ]);

      expect(await casDUsage.importer(aLire, "client-a", "Collecte")).toMatchObject({ created: 2, duplicates: 1 });
      expect(await casDUsage.importer(aLire, "client-a", "Collecte")).toMatchObject({ created: 0, duplicates: 3 });
    });
  });
});
