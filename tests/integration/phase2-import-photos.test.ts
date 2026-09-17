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
import { Client } from "@/models/Client";
import { Site } from "@/models/Site";
import { Operation } from "@/models/Operation";

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
    const buffer = await buildXlsxBuffer();
    const formData = new FormData();
    formData.append(
      "file",
      new File([buffer as unknown as BlobPart], "recap.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    );
    formData.append("mode", "import");

    const req = new NextRequest("http://localhost:3000/api/import", {
      method: "POST",
      body: formData,
    });
    const res = await importExcel(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.import).toBe(true);
    expect(data.created).toBe(5);

    // Client par défaut SRH créé
    const client = await Client.findOne({ nom: "SRH" });
    expect(client).not.toBeNull();

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
    const res2 = await importExcel(new NextRequest("http://localhost:3000/api/import", { method: "POST", body: formData2 }));
    const data2 = await res2.json();
    expect(data2.created).toBe(0);
    expect(data2.duplicates).toBe(5);
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

    // rapportPdf saved on the operation
    const updated = await Operation.findById(op._id);
    expect(updated!.rapportPdf).toContain("data:application/pdf");
  });
});