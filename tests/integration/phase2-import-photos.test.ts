import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";
import ExcelJS from "exceljs";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { POST as importExcel } from "@/app/api/import/route";
import { POST as uploadPhoto, DELETE as deletePhoto } from "@/app/api/operations/[id]/photos/route";
import { GET as generateRapport } from "@/app/api/operations/[id]/rapport/route";
import { PATCH as updateStatus } from "@/app/api/operations/[id]/statut/route";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Site } from "@/models/Site";
import { Operation } from "@/models/Operation";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function buildXlsxBuffer() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Feuil1");
  ws.addRow([]);
  ws.addRow(["SITES", "DATES", "QTES"]);
  ws.addRow(["po anoumabo", new Date(2026, 5, 11), 200]);
  ws.addRow(["angre chu", new Date(2026, 5, 11), 600]);
  ws.addRow(["latrille b", new Date(2026, 5, 11), 200]);
  ws.addRow(["pmc", new Date(2026, 5, 19), 900]);
  ws.addRow(["ss moossou", new Date(2026, 5, 23), 3540]);
  ws.addRow([null, null, { formula: "SUM(C3:C7)", result: 5440 }]);
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
}

describe("Phase 2 — Import, Photos, Signature & Rapport", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.mocked(nextAuth.getServerSession).mockResolvedValue({
      user: {
        id: "507f1f77bcf86cd799439011",
        nom: "Admin Ops",
        email: "admin@srh.ci",
        role: "admin",
      },
    } as any);
  });

  it("should preview an Excel file without importing", async () => {
    const buffer = await buildXlsxBuffer();
    const formData = new FormData();
    formData.append(
      "file",
      new File([buffer as unknown as BlobPart], "recap.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    );
    formData.append("mode", "preview");

    const req = new NextRequest("http://localhost:3000/api/import", {
      method: "POST",
      body: formData,
    });
    const res = await importExcel(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.preview).toBe(true);
    expect(data.summary.totalRows).toBe(5);
    expect(data.summary.uniqueSites).toBe(5);
    expect(data.summary.totalQuantite).toBe(5440);
    expect(data.summary.apercu).toHaveLength(5);
  });

  it("should import an Excel file and create sites + operations", async () => {
    // I2 : le client cible est désormais obligatoire et jamais créé à la volée.
    const targetClient = await Client.create({ nom: "Client Import" });

    const buffer = await buildXlsxBuffer();
    const formData = new FormData();
    formData.append(
      "file",
      new File([buffer as unknown as BlobPart], "recap.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    );
    formData.append("mode", "import");
    formData.append("clientId", targetClient._id.toString());

    const req = new NextRequest("http://localhost:3000/api/import", {
      method: "POST",
      body: formData,
    });
    const res = await importExcel(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.import).toBe(true);
    expect(data.created).toBe(5);

    // Aucun client "SRH" fabriqué automatiquement
    expect(await Client.findOne({ nom: "SRH" })).toBeNull();
    expect(await Client.countDocuments()).toBe(1);

    // Sites créés
    const sites = await Site.find({});
    expect(sites.length).toBe(5);

    // Opérations Rapportée
    const ops = await Operation.find({});
    expect(ops.length).toBe(5);
    for (const op of ops) {
      expect(op.statut).toBe("Rapportée");
      expect(op.uniteQuantite).toBe("Litres");
      expect(op.quantiteCollectee).toBeGreaterThan(0);
      expect(op.historiqueStatuts.length).toBeGreaterThanOrEqual(1);
    }

    // Ré-import idempotent (pas de doublons)
    const formData2 = new FormData();
    formData2.append(
      "file",
      new File([buffer as unknown as BlobPart], "recap.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    );
    formData2.append("mode", "import");
    formData2.append("clientId", targetClient._id.toString());
    const res2 = await importExcel(new NextRequest("http://localhost:3000/api/import", { method: "POST", body: formData2 }));
    const data2 = await res2.json();
    expect(data2.created).toBe(0);
    expect(data2.duplicates).toBe(5);
  });

  describe("Garde-fous de l'import (I1, I2, I3, I5)", () => {
    async function importForm(fields: Record<string, string>, file?: File) {
      const formData = new FormData();
      if (file) formData.append("file", file);
      Object.entries(fields).forEach(([k, v]) => formData.append(k, v));
      return importExcel(
        new NextRequest("http://localhost:3000/api/import", { method: "POST", body: formData })
      );
    }

    async function xlsxFile(name = "recap.xlsx") {
      const buffer = await buildXlsxBuffer();
      return new File([buffer as unknown as BlobPart], name, { type: XLSX_MIME });
    }

    it("refuse un import sans clientId (I2)", async () => {
      const res = await importForm({ mode: "import" }, await xlsxFile());
      expect(res.status).toBe(400);
      expect(await Client.countDocuments()).toBe(0);
    });

    it("refuse un clientId malformé sans planter en 500 (I2)", async () => {
      const res = await importForm(
        { mode: "import", clientId: "pas-un-id" },
        await xlsxFile()
      );
      expect(res.status).toBe(400);
      expect(await Client.countDocuments()).toBe(0);
    });

    it("refuse un clientId inconnu et ne crée aucun client (I2)", async () => {
      const res = await importForm(
        { mode: "import", clientId: "507f1f77bcf86cd799439099" },
        await xlsxFile()
      );
      expect(res.status).toBe(404);
      expect(await Client.countDocuments()).toBe(0);
    });

    it("refuse un fichier de plus de 5 Mo (I3)", async () => {
      const big = new File(
        [new Uint8Array(5 * 1024 * 1024 + 1024)],
        "gros.xlsx",
        { type: XLSX_MIME }
      );
      const client = await Client.create({ nom: "Client Gros Fichier" });
      const res = await importForm({ mode: "preview", clientId: client._id.toString() }, big);
      expect(res.status).toBe(413);
    });

    it("refuse un fichier qui n'est pas un .xlsx (I3)", async () => {
      const client = await Client.create({ nom: "Client Mauvais Format" });
      const res = await importForm(
        { mode: "preview", clientId: client._id.toString() },
        await xlsxFile("recap.csv")
      );
      expect(res.status).toBe(400);
    });

    it("ne réutilise pas le site d'un autre client (I1)", async () => {
      const clientA = await Client.create({ nom: "Client A Import" });
      const clientB = await Client.create({ nom: "Client B Import" });
      await Site.create({ clientId: clientA._id, nom: "PO Anoumabo" });

      const res = await importForm(
        { mode: "import", clientId: clientB._id.toString() },
        await xlsxFile()
      );
      expect(res.status).toBe(200);

      const sites = await Site.find({ nom: { $regex: /^po anoumabo$/i } });
      expect(sites).toHaveLength(2);
      expect(sites.filter((s) => String(s.clientId) === String(clientB._id))).toHaveLength(1);

      const operations = await Operation.find({});
      for (const op of operations) {
        expect(String(op.clientId)).toBe(String(clientB._id));
      }
    });

    it("ignore les lignes à quantité nulle et les signale (I5)", async () => {
      const client = await Client.create({ nom: "Client Quantite Nulle" });

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Feuil1");
      ws.addRow(["SITES", "DATES", "QTES"]);
      ws.addRow(["site plein", new Date(2026, 5, 11), 200]);
      ws.addRow(["site zero", new Date(2026, 5, 12), 0]);
      const buffer = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);

      const res = await importForm(
        { mode: "import", clientId: client._id.toString() },
        new File([buffer as unknown as BlobPart], "quantites.xlsx", { type: XLSX_MIME })
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.created).toBe(1);
      expect(data.summary.skippedRows).toBe(1);
      const reported = data.summary.errors.find((e: { row: number }) => e.row === 3);
      expect(reported.message).toContain("quantité nulle ou absente");

      const ops = await Operation.find({});
      expect(ops).toHaveLength(1);
      expect(ops[0].quantiteCollectee).toBe(200);
    });
  });

  it("should store client signature via status update", async () => {
    const client = await Client.create({ nom: "Client Signature" });
    const site = await Site.create({ clientId: client._id, nom: "Site Signature" });
    const op = await Operation.create({
      clientId: client._id,
      siteId: site._id,
      natureIntervention: "Collecte Signature",
      dateHeurePrevue: new Date(),
      statut: "En cours",
    });

    const req = new NextRequest(`http://localhost:3000/api/operations/${op._id}/statut`, {
      method: "PATCH",
      body: JSON.stringify({
        statut: "Terminée",
        quantiteCollectee: 850,
        uniteQuantite: "Litres",
        remarquesTerrain: "Cuve vidée",
        nomSignataireClient: "M. Kouassi",
        signatureClient: "data:image/png;base64,AAAA",
      }),
    });

    const res = await updateStatus(req, { params: Promise.resolve({ id: op._id.toString() }) });
    expect(res.status).toBe(200);
    const updated = await Operation.findById(op._id);
    expect(updated!.statut).toBe("Terminée");
    expect(updated!.signatureClient).toBe("data:image/png;base64,AAAA");
    expect(updated!.nomSignataireClient).toBe("M. Kouassi");
    expect(updated!.quantiteCollectee).toBe(850);
  });

  it("should upload and delete a photo", async () => {
    const client = await Client.create({ nom: "Client Photos" });
    const site = await Site.create({ clientId: client._id, nom: "Site Photos" });
    const op = await Operation.create({
      clientId: client._id,
      siteId: site._id,
      natureIntervention: "Collecte Photos",
      dateHeurePrevue: new Date(),
    });

    const imgDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const req = new NextRequest(`http://localhost:3000/api/operations/${op._id}/photos`, {
      method: "POST",
      body: JSON.stringify({ photo: imgDataUrl, nom: "photo-test.png" }),
    });

    const res = await uploadPhoto(req, { params: Promise.resolve({ id: op._id.toString() }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.photo.url).toBe(imgDataUrl);

    const updated = await Operation.findById(op._id);
    expect(updated!.photos.length).toBe(1);

    // Delete
    const delReq = new NextRequest(`http://localhost:3000/api/operations/${op._id}/photos`, {
      method: "DELETE",
      body: JSON.stringify({ url: imgDataUrl }),
    });
    const delRes = await deletePhoto(delReq, { params: Promise.resolve({ id: op._id.toString() }) });
    expect(delRes.status).toBe(200);

    const afterDelete = await Operation.findById(op._id);
    expect(afterDelete!.photos.length).toBe(0);
  });

  it("should reject invalid photo formats", async () => {
    const client = await Client.create({ nom: "Client Photo Invalid" });
    const site = await Site.create({ clientId: client._id, nom: "Site Photo Invalid" });
    const op = await Operation.create({
      clientId: client._id,
      siteId: site._id,
      natureIntervention: "Collecte Invalid",
      dateHeurePrevue: new Date(),
    });

    const req = new NextRequest(`http://localhost:3000/api/operations/${op._id}/photos`, {
      method: "POST",
      body: JSON.stringify({ photo: "not-a-data-url", nom: "fake.txt" }),
    });

    const res = await uploadPhoto(req, { params: Promise.resolve({ id: op._id.toString() }) });
    expect(res.status).toBe(400);
  });

  it("should generate a PDF rapport for a completed operation", async () => {
    const client = await Client.create({ nom: "Client Rapport" });
    const site = await Site.create({
      clientId: client._id,
      nom: "Site Rapport",
      adresse: "Abidjan",
      typeDechets: ["Huiles usagées"],
    });
    const op = await Operation.create({
      clientId: client._id,
      siteId: site._id,
      natureIntervention: "Collecte Rapport",
      dateHeurePrevue: new Date(2026, 5, 15),
      statut: "Rapportée",
      quantiteCollectee: 1200,
      uniteQuantite: "Litres",
      nomSignataireClient: "M. Konan",
      signatureClient: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      historiqueStatuts: [
        { statut: "Planifiée", date: new Date(2026, 5, 15) },
        { statut: "Rapportée", date: new Date(2026, 5, 15) },
      ],
    });

    const res = await generateRapport(
      new NextRequest(`http://localhost:3000/api/operations/${op._id}/rapport`),
      { params: Promise.resolve({ id: op._id.toString() }) }
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("filename=");

    const bytes = Buffer.from(await res.arrayBuffer());
    // Signature PDF %PDF-
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");

    // C6 : le PDF n'est plus réécrit dans le document Operation (limite BSON 16 Mo).
    // Il est régénéré à la demande à chaque appel.
    const updated = await Operation.findById(op._id);
    expect(updated!.rapportPdf ?? "").toBe("");
  });

  describe("Plafonds de taille des photos (I12)", () => {
    async function createOperationForPhotos(nom: string) {
      const client = await Client.create({ nom: `Client ${nom}` });
      const site = await Site.create({ clientId: client._id, nom: `Site ${nom}` });
      return Operation.create({
        clientId: client._id,
        siteId: site._id,
        natureIntervention: `Collecte ${nom}`,
        dateHeurePrevue: new Date(),
      });
    }

    function dataUrlOfBytes(bytes: number) {
      const prefix = "data:image/jpeg;base64,";
      return prefix + "A".repeat(Math.max(0, bytes - prefix.length));
    }

    it("refuse une photo dont la charge utile dépasse 2 Mo", async () => {
      const op = await createOperationForPhotos("Photo Trop Grosse");
      const tooBig = dataUrlOfBytes(2 * 1024 * 1024 + 10);

      const res = await uploadPhoto(
        new NextRequest(`http://localhost:3000/api/operations/${op._id}/photos`, {
          method: "POST",
          body: JSON.stringify({ photo: tooBig, nom: "grosse.jpg" }),
        }),
        { params: Promise.resolve({ id: op._id.toString() }) }
      );

      expect(res.status).toBe(413);
      const body = await res.json();
      expect(body.error).toContain("2 Mo");
      expect((await Operation.findById(op._id))!.photos.length).toBe(0);
    });

    it("refuse une photo qui ferait dépasser 8 Mo cumulés sur l'opération", async () => {
      const op = await createOperationForPhotos("Photos Cumulees");
      const photo = dataUrlOfBytes(1_900_000);

      for (let i = 0; i < 4; i++) {
        const res = await uploadPhoto(
          new NextRequest(`http://localhost:3000/api/operations/${op._id}/photos`, {
            method: "POST",
            body: JSON.stringify({ photo: photo + String(i), nom: `p${i}.jpg` }),
          }),
          { params: Promise.resolve({ id: op._id.toString() }) }
        );
        expect(res.status).toBe(201);
      }

      const res = await uploadPhoto(
        new NextRequest(`http://localhost:3000/api/operations/${op._id}/photos`, {
          method: "POST",
          body: JSON.stringify({ photo: photo + "last", nom: "p4.jpg" }),
        }),
        { params: Promise.resolve({ id: op._id.toString() }) }
      );

      expect(res.status).toBe(413);
      const body = await res.json();
      expect(body.error).toContain("8 Mo");
      expect((await Operation.findById(op._id))!.photos.length).toBe(4);
    });
  });
});