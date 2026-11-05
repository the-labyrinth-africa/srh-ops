import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { GET as getOperations, POST as createOperation } from "@/app/api/operations/route";
import { POST as recordCollection } from "@/app/api/operations/collectes/route";
import { GET as getOperationById, PUT as updateOperation, DELETE as deleteOperation } from "@/app/api/operations/[id]/route";
import { Operation } from "@/backend/operations/infrastructure/mongoose/operation.model";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Site } from "@/backend/clients-sites/infrastructure/mongoose/site.model";
import { Equipe } from "@/backend/equipes/infrastructure/mongoose/equipe.model";
import { Vehicule } from "@/backend/vehicules/infrastructure/mongoose/vehicule.model";

describe("Operations API Integration Tests", () => {
  let clientId: string;
  let siteId: string;
  let equipeId: string;
  let vehiculeId: string;

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

    // Create required base entity dependencies
    const client = await Client.create({ nom: "Client Opérations Test" });
    const site = await Site.create({ clientId: client._id, nom: "Site Opérations Test" });
    const equipe = await Equipe.create({ nom: "Équipe Test" });
    const vehicule = await Vehicule.create({ identification: "V-999-TT" });

    clientId = client._id.toString();
    siteId = site._id.toString();
    equipeId = equipe._id.toString();
    vehiculeId = vehicule._id.toString();
  });

  it("should reject manual creation of a planned operation", async () => {
    const req = new NextRequest("http://localhost:3000/api/operations", {
      method: "POST",
      body: JSON.stringify({
        clientId,
        siteId,
        natureIntervention: "Collecte Urgente",
        dateHeurePrevue: "2026-11-01T10:00:00Z",
        dureeEstimeeMinutes: 120,
        equipeId,
        vehiculeId,
        informationsParticulieres: "Bacs sécurisés",
      }),
    });

    const res = await createOperation(req);
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("planification manuelle est désactivée") });
    expect(await Operation.countDocuments()).toBe(0);
  });

  it("should persist a manually recorded collection as reported", async () => {
    const req = new NextRequest("http://localhost:3000/api/operations/collectes", {
      method: "POST",
      body: JSON.stringify({
        clientId,
        siteId,
        natureIntervention: "Collecte réelle",
        dateCollecte: "2026-11-01T10:00:00.000Z",
        quantiteCollectee: 650,
        uniteQuantite: "Litres",
      }),
    });

    const response = await recordCollection(req);
    expect(response.status).toBe(201);
    const [saved] = await Operation.find({ siteId }).lean();
    expect(String(saved?.clientId)).toBe(clientId);
    expect(String(saved?.siteId)).toBe(siteId);
    expect(saved).toMatchObject({
      statut: "Rapportée",
      quantiteCollectee: 650,
      uniteQuantite: "Litres",
    });
    expect(saved?.historiqueStatuts).toHaveLength(1);
    expect(saved?.historiqueStatuts[0].statut).toBe("Rapportée");
  });

  it("should list recorded collections while excluding planned operations", async () => {
    const reqCreate = new NextRequest("http://localhost:3000/api/operations/collectes", {
      method: "POST",
      body: JSON.stringify({
        clientId,
        siteId,
        natureIntervention: "Filtrage Opération",
        dateCollecte: "2026-11-02T14:00:00.000Z",
        quantiteCollectee: 300,
        uniteQuantite: "Litres",
      }),
    });
    await recordCollection(reqCreate);
    await Operation.create({
      clientId,
      siteId,
      natureIntervention: "Prévision historique",
      dateHeurePrevue: new Date("2026-11-03T14:00:00.000Z"),
      statut: "Planifiée",
    });

    // List with query params
    const reqList = new NextRequest(
      `http://localhost:3000/api/operations?clientId=${clientId}&collectes=1&page=1&limit=10`
    );
    const resList = await getOperations(reqList);
    expect(resList.status).toBe(200);

    const data = await resList.json();
    expect(data.items).toBeDefined();
    expect(data.total).toBe(1);
    expect(data.page).toBe(1);
    expect(data.limit).toBe(10);
  });

  it("should fetch, update, and delete a recorded collection", async () => {
    const reqCreate = new NextRequest("http://localhost:3000/api/operations/collectes", {
      method: "POST",
      body: JSON.stringify({
        clientId,
        siteId,
        natureIntervention: "Initial Ops",
        dateCollecte: "2026-11-03T08:00:00.000Z",
        quantiteCollectee: 400,
        uniteQuantite: "Litres",
      }),
    });
    const resCreate = await recordCollection(reqCreate);
    expect(resCreate.status).toBe(201);
    const [op] = await Operation.find({ siteId }).lean();
    const opId = String(op?._id);

    // Fetch single
    const resGet = await getOperationById(
      new NextRequest(`http://localhost:3000/api/operations/${opId}`),
      { params: Promise.resolve({ id: opId }) }
    );
    expect(resGet.status).toBe(200);

    // Update
    const reqUpdate = new NextRequest(
      `http://localhost:3000/api/operations/${opId}`,
      {
        method: "PUT",
        body: JSON.stringify({
          clientId,
          siteId,
          natureIntervention: "Updated Ops Nature",
          dateHeurePrevue: "2026-11-03T08:00:00Z",
        }),
      }
    );
    const resUpdate = await updateOperation(reqUpdate, {
      params: Promise.resolve({ id: opId }),
    });
    expect(resUpdate.status).toBe(200);
    const updated = await resUpdate.json();
    expect(updated.natureIntervention).toBe("Updated Ops Nature");

    // Delete
    const resDelete = await deleteOperation(
      new NextRequest(`http://localhost:3000/api/operations/${opId}`),
      { params: Promise.resolve({ id: opId }) }
    );
    expect(resDelete.status).toBe(200);
  });
});
