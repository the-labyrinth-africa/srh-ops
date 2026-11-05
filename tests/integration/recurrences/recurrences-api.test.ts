import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { GET as getRecurrences, POST as createRecurrence } from "@/app/api/recurrences/route";
import {
  GET as getRecurrenceById,
  PUT as updateRecurrence,
  DELETE as deleteRecurrence,
} from "@/app/api/recurrences/[id]/route";
import { POST as generateOperations } from "@/app/api/recurrences/generate/route";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Site } from "@/backend/clients-sites/infrastructure/mongoose/site.model";
import { Operation } from "@/backend/operations/infrastructure/mongoose/operation.model";

describe("Collectes récurrentes API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(nextAuth.getServerSession).mockResolvedValue({
      user: {
        id: "507f1f77bcf86cd799439011",
        nom: "Admin Ops",
        email: "admin@srh.ci",
        role: "admin",
      },
    } as never);
  });

  it("crée, liste, modifie et supprime une configuration de récurrence", async () => {
    const client = await Client.create({ nom: "Usine AgroIndustrielle" });
    const site = await Site.create({ clientId: client._id, nom: "Site Principal" });

    const response = await createRecurrence(
      new NextRequest("http://localhost:3000/api/recurrences", {
        method: "POST",
        body: JSON.stringify({
          clientId: String(client._id),
          siteId: String(site._id),
          natureIntervention: "Collecte hebdomadaire huiles",
          frequence: "hebdomadaire",
          jourSemaine: 1,
          heurePrevue: "09:00",
          dureeEstimeeMinutes: 120,
          active: true,
        }),
      })
    );
    expect(response.status).toBe(201);
    const recurrence = await response.json();

    const listed = await getRecurrences(new NextRequest("http://localhost:3000/api/recurrences"));
    expect(listed.status).toBe(200);
    expect((await listed.json()).items.some((item: { _id: string }) => item._id === recurrence._id)).toBe(true);

    const params = { params: Promise.resolve({ id: recurrence._id }) };
    const detail = await getRecurrenceById(
      new NextRequest(`http://localhost:3000/api/recurrences/${recurrence._id}`),
      params
    );
    expect(detail.status).toBe(200);

    const updated = await updateRecurrence(
      new NextRequest(`http://localhost:3000/api/recurrences/${recurrence._id}`, {
        method: "PUT",
        body: JSON.stringify({
          clientId: String(client._id),
          siteId: String(site._id),
          natureIntervention: "Collecte mensuelle huiles",
          frequence: "mensuelle",
          jourMois: 15,
          heurePrevue: "10:00",
          dureeEstimeeMinutes: 150,
          active: true,
        }),
      }),
      params
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).frequence).toBe("mensuelle");

    const deleted = await deleteRecurrence(
      new NextRequest(`http://localhost:3000/api/recurrences/${recurrence._id}`, { method: "DELETE" }),
      params
    );
    expect(deleted.status).toBe(200);
  });

  it("refuse la génération automatique d'opérations et ne crée aucune opération", async () => {
    const response = await generateOperations(
      new NextRequest("http://localhost:3000/api/recurrences/generate", {
        method: "POST",
        body: JSON.stringify({ horizonDays: 30 }),
      })
    );

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      error: "La création automatique d'opérations récurrentes est désactivée. Les tournées sont désormais calculées depuis l'historique des collectes.",
    });
    expect(await Operation.countDocuments()).toBe(0);
  });
});
