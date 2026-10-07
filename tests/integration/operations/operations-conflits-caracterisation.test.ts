import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { POST as createOperation } from "@/app/api/operations/route";
import { PUT as updateOperation } from "@/app/api/operations/[id]/route";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Site } from "@/backend/clients-sites/infrastructure/mongoose/site.model";
import { Equipe } from "@/backend/equipes/infrastructure/mongoose/equipe.model";
import { Vehicule } from "@/backend/vehicules/infrastructure/mongoose/vehicule.model";

const MESSAGE_EQUIPE = "L'équipe est déjà affectée à une opération sur ce créneau";
const MESSAGE_VEHICULE = "Le véhicule est déjà affecté à une opération sur ce créneau";

describe("Caractérisation — conflits d'affectation (corps exact du 409)", () => {
  let clientId: string;
  let siteId: string;
  let equipeId: string;
  let vehiculeId: string;

  const corps = (surcharge: Record<string, unknown> = {}) => ({
    clientId,
    siteId,
    natureIntervention: "Collecte",
    dateHeurePrevue: "2026-11-01T10:00:00Z",
    dureeEstimeeMinutes: 120,
    equipeId,
    vehiculeId,
    ...surcharge,
  });

  const creer = (surcharge: Record<string, unknown> = {}) =>
    createOperation(
      new NextRequest("http://localhost:3000/api/operations", {
        method: "POST",
        body: JSON.stringify(corps(surcharge)),
      })
    );

  const modifier = (id: string, surcharge: Record<string, unknown> = {}) =>
    updateOperation(
      new NextRequest(`http://localhost:3000/api/operations/${id}`, {
        method: "PUT",
        body: JSON.stringify(corps(surcharge)),
      }),
      { params: Promise.resolve({ id }) }
    );

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.mocked(nextAuth.getServerSession).mockResolvedValue({
      user: { id: "507f1f77bcf86cd799439011", nom: "Admin Ops", email: "admin@srh.ci", role: "admin" },
    } as never);

    const client = await Client.create({ nom: "Client Conflits" });
    const site = await Site.create({ clientId: client._id, nom: "Site Conflits" });
    const equipe = await Equipe.create({ nom: "Équipe Conflits" });
    const vehicule = await Vehicule.create({ identification: "V-CONF-01" });
    clientId = String(client._id);
    siteId = String(site._id);
    equipeId = String(equipe._id);
    vehiculeId = String(vehicule._id);
  });

  it("POST : équipe et véhicule occupés → 409, deux entrées, équipe avant véhicule", async () => {
    const premiere = await (await creer()).json();

    const res = await creer({ dateHeurePrevue: "2026-11-01T11:00:00Z" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Conflit d'affectation",
      conflicts: [
        { hasConflict: true, message: MESSAGE_EQUIPE, conflictingOperationId: premiere._id },
        { hasConflict: true, message: MESSAGE_VEHICULE, conflictingOperationId: premiere._id },
      ],
    });
  });

  it("POST : seul le véhicule est occupé → 409, une seule entrée véhicule", async () => {
    const premiere = await (await creer()).json();
    const autreEquipe = await Equipe.create({ nom: "Autre équipe" });

    const res = await creer({ dateHeurePrevue: "2026-11-01T11:00:00Z", equipeId: String(autreEquipe._id) });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Conflit d'affectation",
      conflicts: [{ hasConflict: true, message: MESSAGE_VEHICULE, conflictingOperationId: premiere._id }],
    });
  });

  it("POST : créneau bord à bord (début = fin de l'existante) → 201", async () => {
    await creer();
    const res = await creer({ dateHeurePrevue: "2026-11-01T12:00:00Z" });
    expect(res.status).toBe(201);
  });

  it("PUT : une opération ne se bloque pas elle-même → 200", async () => {
    const premiere = await (await creer()).json();
    const res = await modifier(premiere._id, { dateHeurePrevue: "2026-11-01T10:30:00Z" });
    expect(res.status).toBe(200);
  });

  it("PUT : déplacer une opération sur le créneau d'une autre → 409, corps exact", async () => {
    const premiere = await (await creer()).json();
    const seconde = await (await creer({ dateHeurePrevue: "2026-11-01T14:00:00Z" })).json();

    const res = await modifier(seconde._id, { dateHeurePrevue: "2026-11-01T11:00:00Z" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Conflit d'affectation",
      conflicts: [
        { hasConflict: true, message: MESSAGE_EQUIPE, conflictingOperationId: premiere._id },
        { hasConflict: true, message: MESSAGE_VEHICULE, conflictingOperationId: premiere._id },
      ],
    });
  });
});
