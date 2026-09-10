import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { GET as getOperations, POST as createOperation } from "@/app/api/operations/route";
import { GET as getOperationById, PUT as updateOperation, DELETE as deleteOperation } from "@/app/api/operations/[id]/route";
import { Client } from "@/models/Client";
import { Site } from "@/models/Site";
import { Equipe } from "@/models/Equipe";
import { Vehicule } from "@/models/Vehicule";

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

  it("should create an operation with status Affectée when equipe and vehicule are assigned", async () => {
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
    expect(res.status).toBe(201);
    const op = await res.json();

    expect(op._id).toBeDefined();
    expect(op.statut).toBe("Affectée");
    expect(op.historiqueStatuts).toHaveLength(1);
    expect(op.historiqueStatuts[0].statut).toBe("Affectée");
  });

  it("should return HTTP 409 Conflict when assigning an already busy team/vehicle", async () => {
    // 1. Create first operation from 10:00 to 12:00
    const req1 = new NextRequest("http://localhost:3000/api/operations", {
      method: "POST",
      body: JSON.stringify({
        clientId,
        siteId,
        natureIntervention: "Opération 1",
        dateHeurePrevue: "2026-11-01T10:00:00Z",
        dureeEstimeeMinutes: 120,
        equipeId,
        vehiculeId,
      }),
    });
    const res1 = await createOperation(req1);
    expect(res1.status).toBe(201);

    // 2. Attempt to create conflicting operation from 10:30 to 12:30 with same team & vehicle
    const req2 = new NextRequest("http://localhost:3000/api/operations", {
      method: "POST",
      body: JSON.stringify({
        clientId,
        siteId,
        natureIntervention: "Opération Conflit",
        dateHeurePrevue: "2026-11-01T10:30:00Z",
        dureeEstimeeMinutes: 120,
        equipeId,
        vehiculeId,
      }),
    });
    const res2 = await createOperation(req2);
    expect(res2.status).toBe(409);

    const body = await res2.json();
    expect(body.error).toBe("Conflit d'affectation");
    expect(body.conflicts.some((c: any) => c.hasConflict)).toBe(true);
  });

  it("should list operations with filtering and pagination", async () => {
    // Create an operation
    const reqCreate = new NextRequest("http://localhost:3000/api/operations", {
      method: "POST",
      body: JSON.stringify({
        clientId,
        siteId,
        natureIntervention: "Filtrage Opération",
        dateHeurePrevue: "2026-11-02T14:00:00Z",
      }),
    });
    await createOperation(reqCreate);

    // List with query params
    const reqList = new NextRequest(
      `http://localhost:3000/api/operations?clientId=${clientId}&page=1&limit=10`
    );
    const resList = await getOperations(reqList);
    expect(resList.status).toBe(200);

    const data = await resList.json();
    expect(data.items).toBeDefined();
    expect(data.total).toBeGreaterThanOrEqual(1);
    expect(data.page).toBe(1);
    expect(data.limit).toBe(10);
  });

  it("should fetch, update, and delete an operation", async () => {
    // Create
    const reqCreate = new NextRequest("http://localhost:3000/api/operations", {
      method: "POST",
      body: JSON.stringify({
        clientId,
        siteId,
        natureIntervention: "Initial Ops",
        dateHeurePrevue: "2026-11-03T08:00:00Z",
      }),
    });
    const resCreate = await createOperation(reqCreate);
    const op = await resCreate.json();
    const opId = op._id;

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
