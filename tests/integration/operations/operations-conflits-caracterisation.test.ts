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
import { Operation } from "@/backend/operations/infrastructure/mongoose/operation.model";
import { Equipe } from "@/backend/equipes/infrastructure/mongoose/equipe.model";
import { Vehicule } from "@/backend/vehicules/infrastructure/mongoose/vehicule.model";

const MESSAGE_EQUIPE = "L'équipe est déjà affectée à une opération sur ce créneau";
const MESSAGE_VEHICULE = "Le véhicule est déjà affecté à une opération sur ce créneau";

describe("Opérations — planification manuelle et conflits", () => {
  let clientId: string;
  let siteId: string;
  let equipeId: string;
  let vehiculeId: string;

  const corps = (dateHeurePrevue: string) => ({
    clientId,
    siteId,
    natureIntervention: "Collecte",
    dateHeurePrevue,
    dureeEstimeeMinutes: 120,
    equipeId,
    vehiculeId,
  });

  const modifier = (id: string, dateHeurePrevue: string) =>
    updateOperation(
      new NextRequest(`http://localhost:3000/api/operations/${id}`, {
        method: "PUT",
        body: JSON.stringify(corps(dateHeurePrevue)),
      }),
      { params: Promise.resolve({ id }) }
    );

  const creerOperationHistorique = (dateHeurePrevue: string) =>
    Operation.create({
      clientId,
      siteId,
      natureIntervention: "Collecte",
      dateHeurePrevue: new Date(dateHeurePrevue),
      dureeEstimeeMinutes: 120,
      equipeId,
      vehiculeId,
      equipementIds: [],
      informationsParticulieres: "",
      statut: "Affectée",
      historiqueStatuts: [],
    });

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

  it("refuse la création d'une opération planifiée", async () => {
    const response = await createOperation(
      new NextRequest("http://localhost:3000/api/operations", {
        method: "POST",
        body: JSON.stringify(corps("2026-11-01T10:00:00Z")),
      })
    );

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      error: "La planification manuelle est désactivée. Enregistrez une collecte réalisée ou importez son fichier Excel.",
    });
  });

  it("exclut l'opération modifiée de sa propre détection de conflit", async () => {
    const operation = await creerOperationHistorique("2026-11-01T10:00:00Z");
    const response = await modifier(String(operation._id), "2026-11-01T10:30:00Z");

    expect(response.status).toBe(200);
  });

  it("empêche de déplacer une opération sur un créneau occupé", async () => {
    const premiere = await creerOperationHistorique("2026-11-01T10:00:00Z");
    const seconde = await creerOperationHistorique("2026-11-01T14:00:00Z");
    const response = await modifier(String(seconde._id), "2026-11-01T11:00:00Z");

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Conflit d'affectation",
      conflicts: [
        { hasConflict: true, message: MESSAGE_EQUIPE, conflictingOperationId: String(premiere._id) },
        { hasConflict: true, message: MESSAGE_VEHICULE, conflictingOperationId: String(premiere._id) },
      ],
    });
  });

  it("autorise deux opérations lorsque le créneau est bord à bord", async () => {
    const seconde = await creerOperationHistorique("2026-11-01T14:00:00Z");
    const response = await modifier(String(seconde._id), "2026-11-01T12:00:00Z");

    expect(response.status).toBe(200);
  });
});
