import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { POST as createOperation } from "@/app/api/operations/route";
import { PATCH as updateStatus } from "@/app/api/operations/[id]/statut/route";
import { Client } from "@/models/Client";
import { Site } from "@/models/Site";

describe("Status Transition Workflow Integration Tests", () => {
  let clientId: string;
  let siteId: string;
  let userId: string;

  beforeEach(async () => {
    vi.resetAllMocks();
    userId = "507f1f77bcf86cd799439011";
    vi.mocked(nextAuth.getServerSession).mockResolvedValue({
      user: {
        id: userId,
        nom: "Dispatcher Test",
        email: "dispatcher@srh.ci",
        role: "dispatcher",
      },
    } as any);

    const client = await Client.create({ nom: "Client Workflow" });
    const site = await Site.create({ clientId: client._id, nom: "Site Workflow" });

    clientId = client._id.toString();
    siteId = site._id.toString();
  });

  it("should advance status step-by-step and append to historiqueStatuts", async () => {
    // 1. Create operation (Initial status: Planifiée)
    const reqCreate = new NextRequest("http://localhost:3000/api/operations", {
      method: "POST",
      body: JSON.stringify({
        clientId,
        siteId,
        natureIntervention: "Workflow Collecte",
        dateHeurePrevue: "2026-12-01T08:00:00Z",
      }),
    });
    const resCreate = await createOperation(reqCreate);
    const op = await resCreate.json();
    const opId = op._id;
    expect(op.statut).toBe("Planifiée");

    // 2. Transition Planifiée -> Affectée
    const req1 = new NextRequest(`http://localhost:3000/api/operations/${opId}/statut`, {
      method: "PATCH",
      body: JSON.stringify({ statut: "Affectée" }),
    });
    const res1 = await updateStatus(req1, { params: Promise.resolve({ id: opId }) });
    expect(res1.status).toBe(200);
    const op1 = await res1.json();
    expect(op1.statut).toBe("Affectée");

    // 3. Transition Affectée -> En route
    const req2 = new NextRequest(`http://localhost:3000/api/operations/${opId}/statut`, {
      method: "PATCH",
      body: JSON.stringify({ statut: "En route" }),
    });
    const res2 = await updateStatus(req2, { params: Promise.resolve({ id: opId }) });
    expect(res2.status).toBe(200);

    // 4. Transition En route -> En cours
    const req3 = new NextRequest(`http://localhost:3000/api/operations/${opId}/statut`, {
      method: "PATCH",
      body: JSON.stringify({ statut: "En cours" }),
    });
    const res3 = await updateStatus(req3, { params: Promise.resolve({ id: opId }) });
    expect(res3.status).toBe(200);

    // 5. Transition En cours -> Terminée
    const req4 = new NextRequest(`http://localhost:3000/api/operations/${opId}/statut`, {
      method: "PATCH",
      body: JSON.stringify({ statut: "Terminée" }),
    });
    const res4 = await updateStatus(req4, { params: Promise.resolve({ id: opId }) });
    expect(res4.status).toBe(200);

    // 6. Transition Terminée -> Rapportée
    const req5 = new NextRequest(`http://localhost:3000/api/operations/${opId}/statut`, {
      method: "PATCH",
      body: JSON.stringify({ statut: "Rapportée" }),
    });
    const res5 = await updateStatus(req5, { params: Promise.resolve({ id: opId }) });
    expect(res5.status).toBe(200);
    const finalOp = await res5.json();

    expect(finalOp.statut).toBe("Rapportée");
    // Verify historiqueStatuts history length (Initial 1 + 5 transitions = 6)
    expect(finalOp.historiqueStatuts).toHaveLength(6);
    expect(finalOp.historiqueStatuts[5].statut).toBe("Rapportée");
    expect(finalOp.historiqueStatuts[5].ancienStatut).toBe("Terminée");
  });

  it("should reject illegal status transitions with HTTP 400", async () => {
    // Create operation in Planifiée state
    const reqCreate = new NextRequest("http://localhost:3000/api/operations", {
      method: "POST",
      body: JSON.stringify({
        clientId,
        siteId,
        natureIntervention: "Illegal Transition Test",
        dateHeurePrevue: "2026-12-01T08:00:00Z",
      }),
    });
    const resCreate = await createOperation(reqCreate);
    const op = await resCreate.json();

    // Attempt illegal jump: Planifiée -> Terminée
    const reqIllegal = new NextRequest(`http://localhost:3000/api/operations/${op._id}/statut`, {
      method: "PATCH",
      body: JSON.stringify({ statut: "Terminée" }),
    });
    const resIllegal = await updateStatus(reqIllegal, { params: Promise.resolve({ id: op._id }) });
    expect(resIllegal.status).toBe(400);

    const body = await resIllegal.json();
    expect(body.error).toContain("non autorisée");
  });
});
