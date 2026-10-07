import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import * as nextAuth from "next-auth";
import ExcelJS from "exceljs";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { POST as importer } from "@/app/api/import/route";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Site } from "@/backend/clients-sites/infrastructure/mongoose/site.model";
import { Operation } from "@/backend/operations/infrastructure/mongoose/operation.model";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DATE_ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
const ID = expect.stringMatching(/^[a-f\d]{24}$/);

type Ligne = (string | number | Date | null)[];

async function classeur(lignes: Ligne[], entetes: Ligne = ["SITES", "DATES", "QTES"]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Feuil1");
  ws.addRow(entetes);
  for (const ligne of lignes) ws.addRow(ligne);
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

/** Dates locales, comme les cellules d'un classeur saisi à la main. */
const J11 = new Date(2026, 5, 11);
const J19 = new Date(2026, 5, 19);
const aHuitHeures = (date: Date) => {
  const d = new Date(date);
  d.setHours(8, 0, 0, 0);
  return d;
};

const LIGNES: Ligne[] = [
  ["po anoumabo", J11, 200],
  ["angre chu", J11, 600],
  ["pmc", J19, 900],
];

function multipart(
  buffer: Buffer | null,
  champs: Record<string, string> = {},
  fichier: { nom?: string; type?: string } = {}
): NextRequest {
  const formData = new FormData();
  if (buffer) {
    formData.append(
      "file",
      new File([buffer as unknown as BlobPart], fichier.nom ?? "recap.xlsx", { type: fichier.type ?? XLSX_MIME })
    );
  }
  for (const [cle, valeur] of Object.entries(champs)) formData.append(cle, valeur);
  return new NextRequest("http://localhost:3000/api/import", { method: "POST", body: formData });
}

const json = (corps: unknown) =>
  new NextRequest("http://localhost:3000/api/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corps),
  });

describe("Caractérisation — import Excel (formes exactes)", () => {
  let clientId: string;

  const connecter = (role: string, rattachements: Record<string, string> = {}) =>
    vi.mocked(nextAuth.getServerSession).mockResolvedValue({
      user: { id: "507f1f77bcf86cd799439011", nom: "Admin Ops", email: "admin@srh.ci", role, ...rattachements },
    } as never);

  const resumeAttendu = {
    fileName: "recap.xlsx",
    totalRows: 3,
    skippedRows: 0,
    errors: [],
    uniqueSites: 3,
    totalQuantite: 1700,
    uniteApercu: "Litres",
    dateMin: J11.toISOString(),
    dateMax: J19.toISOString(),
    apercu: [
      { site: "po anoumabo", date: J11.toISOString(), quantite: 200, rowNumber: 2 },
      { site: "angre chu", date: J11.toISOString(), quantite: 600, rowNumber: 3 },
      { site: "pmc", date: J19.toISOString(), quantite: 900, rowNumber: 4 },
    ],
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    connecter("admin");
    clientId = String((await Client.create({ nom: "Client Import" }))._id);
  });

  describe("aperçu", () => {
    it("corps exact, rien n'est écrit, le client n'est ni requis ni vérifié", async () => {
      const res = await importer(multipart(await classeur(LIGNES), { mode: "preview", clientId: "pas-un-identifiant" }));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ preview: true, summary: resumeAttendu });
      expect(await Site.countDocuments()).toBe(0);
      expect(await Operation.countDocuments()).toBe(0);
    });

    it("lignes ignorées et erreurs reportées dans le résumé ; aperçu limité à dix lignes", async () => {
      const lignes: Ligne[] = Array.from({ length: 12 }, (_, i) => [`site ${i}`, J11, 10 + i]);
      lignes.push(["sans quantité", J11, null], ["date illisible", "pas une date", 5], [null, null, null]);

      const { summary } = await (await importer(multipart(await classeur(lignes), { mode: "preview" }))).json();

      expect(summary.totalRows).toBe(12);
      expect(summary.apercu).toHaveLength(10);
      expect(summary.skippedRows).toBe(3);
      expect(summary.errors).toEqual([
        { row: 14, message: "Ligne 14 ignorée : quantité nulle ou absente" },
        { row: 15, message: 'Date invalide à la ligne 15: "pas une date"' },
      ]);
    });
  });

  describe("import", () => {
    it("corps exact ; sites et opérations créés avec leurs valeurs exactes", async () => {
      const res = await importer(multipart(await classeur(LIGNES), { mode: "import", clientId }));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ import: true, summary: resumeAttendu, created: 3, duplicates: 0, clientId });

      const sites = JSON.parse(JSON.stringify(await Site.find().sort({ nom: 1 }).lean()));
      expect(sites.map((s: { nom: string }) => s.nom)).toEqual(["angre chu", "pmc", "po anoumabo"]);
      expect(sites[1]).toEqual({
        _id: ID,
        clientId,
        nom: "pmc",
        adresse: "",
        localisation: { lat: 0, lng: 0 },
        typeDechets: ["Huiles usagées"],
        observations: "Importé depuis un fichier Excel",
        createdAt: DATE_ISO,
        updatedAt: DATE_ISO,
        __v: 0,
      });

      const prevue = aHuitHeures(J19);
      const decale = (minutes: number) => new Date(prevue.getTime() + minutes * 60_000).toISOString();
      const operation = JSON.parse(JSON.stringify(await Operation.findOne({ siteId: sites[1]._id }).lean()));
      expect(operation).toEqual({
        _id: ID,
        clientId,
        siteId: sites[1]._id,
        natureIntervention: "Collecte d'huiles usagées",
        dateHeurePrevue: prevue.toISOString(),
        dureeEstimeeMinutes: 120,
        equipementIds: [],
        informationsParticulieres: "",
        statut: "Rapportée",
        historiqueStatuts: [
          { statut: "Planifiée", date: decale(-24 * 60) },
          { statut: "Affectée", date: decale(0) },
          { statut: "En route", date: decale(30) },
          { statut: "En cours", date: decale(60) },
          { statut: "Terminée", date: decale(120) },
          { statut: "Rapportée", date: decale(180) },
        ],
        quantiteCollectee: 900,
        uniteQuantite: "Litres",
        remarquesTerrain: "Intervention importée depuis un fichier Excel",
        nomSignataireClient: "",
        signatureClient: "",
        rapportPdf: "",
        photos: [],
        createdAt: DATE_ISO,
        updatedAt: DATE_ISO,
        __v: 0,
      });
    });

    it("ré-import : aucune création, tout est compté en doublon", async () => {
      const fichier = await classeur(LIGNES);
      await importer(multipart(fichier, { mode: "import", clientId }));

      const corps = await (await importer(multipart(fichier, { mode: "import", clientId }))).json();

      expect(corps).toMatchObject({ import: true, created: 0, duplicates: 3, clientId });
      expect(await Site.countDocuments()).toBe(3);
      expect(await Operation.countDocuments()).toBe(3);
    });

    it("le mode par défaut est l'import ; une nature fournie est reprise (espaces retirés)", async () => {
      const res = await importer(
        multipart(await classeur(LIGNES), { clientId, natureIntervention: "  Vidange de bacs  " })
      );
      expect((await res.json()).import).toBe(true);
      expect(await Operation.distinct("natureIntervention")).toEqual(["Vidange de bacs"]);
    });

    it("site existant du client retrouvé sans tenir compte de la casse ; les caractères spéciaux du nom sont pris littéralement", async () => {
      const existant = await Site.create({ clientId, nom: "PO Anoumabo", adresse: "Quai 3" });
      const autreClient = await Client.create({ nom: "Autre client" });
      await Site.create({ clientId: autreClient._id, nom: "pmc" });

      const fichier = await classeur([
        ["po anoumabo", J11, 200],
        ["pmc", J11, 300],
        ["dépôt (a+b).", J11, 50],
      ]);
      const corps = await (await importer(multipart(fichier, { mode: "import", clientId }))).json();

      expect(corps.created).toBe(3);
      const duClient = await Site.find({ clientId }).sort({ nom: 1 }).lean();
      expect(duClient.map((s) => s.nom)).toEqual(["PO Anoumabo", "dépôt (a+b).", "pmc"]);
      expect(await Operation.countDocuments({ siteId: existant._id })).toBe(1);
      expect(await Site.countDocuments({ nom: "pmc" })).toBe(2);
    });

    it("deux lignes identiques dans le fichier (site, date, quantité) : une création, un doublon", async () => {
      const fichier = await classeur([
        ["pmc", J11, 300],
        ["PMC ", J11, 300],
        ["pmc", J11, 301],
      ]);
      const corps = await (await importer(multipart(fichier, { mode: "import", clientId }))).json();
      expect(corps).toMatchObject({ created: 2, duplicates: 1 });
      expect(corps.summary.uniqueSites).toBe(2);
      expect(await Site.countDocuments()).toBe(1);
    });

    it("corps JSON : fichier en base64 (avec ou sans préfixe data:), nom par défaut « interventions.xlsx »", async () => {
      const base64 = (await classeur(LIGNES)).toString("base64");

      const apercu = await (await importer(json({ fileBase64: base64, mode: "preview" }))).json();
      expect(apercu.summary.fileName).toBe("interventions.xlsx");
      expect(apercu.summary.totalRows).toBe(3);

      const corps = await (
        await importer(json({ fileBase64: `data:${XLSX_MIME};base64,${base64}`, fileName: "juin.xlsx", clientId }))
      ).json();
      expect(corps).toMatchObject({ import: true, created: 3, clientId });
      expect(corps.summary.fileName).toBe("juin.xlsx");
    });
  });

  describe("refus", () => {
    it("fichier absent : messages exacts selon le type de corps", async () => {
      const sansFichier = await importer(multipart(null, { mode: "preview" }));
      expect(sansFichier.status).toBe(400);
      expect(await sansFichier.json()).toEqual({ error: "Fichier requis" });

      for (const corps of [{}, { fileBase64: "" }, { mode: "preview" }]) {
        const res = await importer(json(corps));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "Fichier requis (multipart ou fileBase64)" });
      }
    });

    it("type ou extension refusés (400), fichier trop lourd (413) : messages exacts", async () => {
      const fichier = await classeur(LIGNES);

      const mauvaisType = await importer(multipart(fichier, { mode: "preview" }, { type: "text/csv" }));
      expect(mauvaisType.status).toBe(400);
      expect(await mauvaisType.json()).toEqual({
        error: "Format de fichier non supporté : seuls les fichiers .xlsx sont acceptés.",
      });

      const mauvaiseExtension = await importer(multipart(fichier, { mode: "preview" }, { nom: "recap.xls", type: "" }));
      expect(mauvaiseExtension.status).toBe(400);
      expect(await mauvaiseExtension.json()).toEqual({
        error: "Format de fichier non supporté : seuls les fichiers .xlsx sont acceptés.",
      });

      const lourd = await importer(json({ fileBase64: Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64"), mode: "preview" }));
      expect(lourd.status).toBe(413);
      expect(await lourd.json()).toEqual({ error: "Le fichier dépasse 5 Mo. Découpez le classeur avant de l'importer." });
    });

    it("aucune ligne exploitable : 422 avec le premier message et la liste des erreurs", async () => {
      const sansEntetes = await importer(multipart(await classeur([[111, 222, 333]], ["foo1", "bar2", "xyz3"]), { mode: "preview" }));
      expect(sansEntetes.status).toBe(422);
      const message =
        "Impossible de détecter les colonnes (SITES, DATES, QTES). Vérifiez que la première feuille contient ces en-têtes sur les 12 premières lignes.";
      expect(await sansEntetes.json()).toEqual({ error: message, errors: [{ row: 0, message }] });

      const vide = await importer(multipart(await classeur([]), { mode: "import", clientId }));
      expect(vide.status).toBe(422);
      expect(await vide.json()).toEqual({ error: "Aucune ligne exploitable détectée dans le fichier.", errors: [] });
    });

    it("import : client manquant (400), identifiant invalide (400), client inconnu (404) — après l'analyse du fichier", async () => {
      const fichier = await classeur(LIGNES);

      const manquant = await importer(multipart(fichier, { mode: "import" }));
      expect(manquant.status).toBe(400);
      expect(await manquant.json()).toEqual({
        error: "Client requis : sélectionnez le client destinataire de l'import.",
      });

      const invalide = await importer(multipart(fichier, { mode: "import", clientId: "abc" }));
      expect(invalide.status).toBe(400);
      expect(await invalide.json()).toEqual({ error: "Identifiant invalide" });

      const inconnu = await importer(
        multipart(fichier, { mode: "import", clientId: String(new mongoose.Types.ObjectId()) })
      );
      expect(inconnu.status).toBe(404);
      expect(await inconnu.json()).toEqual({ error: "Client introuvable." });

      const illisible = await importer(multipart(await classeur([]), { mode: "import" }));
      expect(illisible.status).toBe(422);

      expect(await Site.countDocuments()).toBe(0);
      expect(await Operation.countDocuments()).toBe(0);
    });

    it("rôles : lecture et chauffeur 403 « Permission insuffisante », rien n'est lu ni écrit", async () => {
      for (const role of ["lecture", "chauffeur"]) {
        connecter(role, role === "chauffeur" ? { equipeId: String(new mongoose.Types.ObjectId()) } : {});
        const res = await importer(multipart(await classeur(LIGNES), { mode: "import", clientId }));
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: "Permission insuffisante" });
      }
      expect(await Operation.countDocuments()).toBe(0);
    });
  });
});
