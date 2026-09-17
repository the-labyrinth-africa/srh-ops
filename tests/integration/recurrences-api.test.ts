import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { GET as getRecurrences, POST as createRecurrence } from "@/app/api/recurrences/route";
import { GET as getRecurrenceById, PUT as updateRecurrence, DELETE as deleteRecurrence } from "@/app/api/recurrences/[id]/route";
import { POST as generateOperations } from "@/app/api/recurrences/generate/route";
import { POST as createClient } from "@/app/api/clients/route";
import { POST as createSite } from "@/app/api/sites/route";
import { GET as getOperations } from "@/app/api/operations/route";

describe("Collectes Récurrentes API Integration Tests", () => {
  beforeEach(() => {
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

  it("should create, list, update and delete a recurrence configuration", async () => {
    // 1. Create client & site
    const reqClient = new NextRequest("http://localhost:3000/api/clients", {
      method: "POST",
      body: JSON.stringify({
        nom: "Usine AgroIndustrielle",
        contact: { telephone: "+22507080910", email: "usine@agro.ci" },
      }),
    });
    const client = await (await createClient(reqClient)).json();

    const reqSite = new NextRequest("http://localhost:3000/api/sites", {
      method: "POST",
      body: JSON.stringify({
        clientId: client._id,
        nom: "Site Principal",
        adresse: "Zone Industrielle Yopougon",
        typeDechets: ["Huiles usagées"],
      }),
    });
    const site = await (await createSite(reqSite)).json();

    // 2. Create recurrence
    const reqRec = new NextRequest("http://localhost:3000/api/recurrences", {
      method: "POST",
      body: JSON.stringify({
        clientId: client._id,
        siteId: site._id,
        natureIntervention: "Collecte hebdomadaire huiles",
        frequence: "hebdomadaire",
        jourSemaine: 1, // Lundi
        heurePrevue: "09:00",
        dureeEstimeeMinutes: 120,
        active: true,
      }),
    });
    const resRec = await createRecurrence(reqRec);
    expect(resRec.status).toBe(201);
    const rec = await resRec.json();
    expect(rec._id).toBeDefined();
    expect(rec.frequence).toBe("hebdomadaire");

    // 3. List recurrences
    const resList = await getRecurrences(new NextRequest("http://localhost:3000/api/recurrences"));
    expect(resList.status).toBe(200);
    const listData = await resList.json();
    expect(listData.items.some((item: any) => item._id === rec._id)).toBe(true);

    // 4. Get single
    const resSingle = await getRecurrenceById(new NextRequest(`http://localhost:3000/api/recurrences/${rec._id}`), {
      params: Promise.resolve({ id: rec._id }),
    });
    expect(resSingle.status).toBe(200);

    // 5. Update
    const reqUpdate = new NextRequest(`http://localhost:3000/api/recurrences/${rec._id}`, {
      method: "PUT",
      body: JSON.stringify({
        clientId: client._id,
        siteId: site._id,
        natureIntervention: "Collecte mensuelle huiles",
        frequence: "mensuelle",
        jourMois: 15,
        heurePrevue: "10:00",
        dureeEstimeeMinutes: 150,
        active: true,
      }),
    });
    const resUpdate = await updateRecurrence(reqUpdate, { params: Promise.resolve({ id: rec._id }) });
    expect(resUpdate.status).toBe(200);
    const updated = await resUpdate.json();
    expect(updated.frequence).toBe("mensuelle");
    expect(updated.jourMois).toBe(15);

    // 6. Delete
    const resDelete = await deleteRecurrence(new NextRequest(`http://localhost:3000/api/recurrences/${rec._id}`), {
      params: Promise.resolve({ id: rec._id }),
    });
    expect(resDelete.status).toBe(200);
  });

  it("should generate recurring operations automatically without duplicates", async () => {
    // Create client & site
    const client = await (
      await createClient(
        new NextRequest("http://localhost:3000/api/clients", {
          method: "POST",
          body: JSON.stringify({
            nom: "Hôtel Ivoire",
            contact: { telephone: "+22501010101", email: "ivoire@hotel.ci" },
          }),
        })
      )
    ).json();

    const site = await (
      await createSite(
        new NextRequest("http://localhost:3000/api/sites", {
          method: "POST",
          body: JSON.stringify({
            clientId: client._id,
            nom: "Cuisines Centrales",
            adresse: "Boulevard de la Corniche",
            typeDechets: ["Huiles alimentaires"],
          }),
        })
      )
    ).json();

    // Create a weekly recurrence for Mondays at 08:00
    await createRecurrence(
      new NextRequest("http://localhost:3000/api/recurrences", {
        method: "POST",
        body: JSON.stringify({
          clientId: client._id,
          siteId: site._id,
          natureIntervention: "Recyclage Huiles de Friture",
          frequence: "hebdomadaire",
          jourSemaine: 1, // Lundi
          heurePrevue: "08:00",
          dureeEstimeeMinutes: 90,
          active: true,
        }),
      })
    );

    // Trigger auto generation over 30 days
    const reqGen = new NextRequest("http://localhost:3000/api/recurrences/generate", {
      method: "POST",
      body: JSON.stringify({ horizonDays: 30 }),
    });
    const resGen = await generateOperations(reqGen);
    expect(resGen.status).toBe(200);
    const genData = await resGen.json();
    expect(genData.generatedCount).toBeGreaterThan(0);

    // Check that operations were created
    const resOps = await getOperations(
      new NextRequest(`http://localhost:3000/api/operations?clientId=${client._id}`)
    );
    const opsData = await resOps.json();
    expect(opsData.items.length).toBe(genData.generatedCount);

    // Triggering generation again should not create duplicate operations
    const resGen2 = await generateOperations(reqGen);
    const genData2 = await resGen2.json();
    expect(genData2.generatedCount).toBe(0);
  });
});
