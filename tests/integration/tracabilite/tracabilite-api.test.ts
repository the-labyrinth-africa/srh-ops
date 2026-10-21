import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { GET as listAll } from "@/app/api/tracabilite/route";
import {
  GET as listForOperation,
  POST as createForOperation,
} from "@/app/api/operations/[id]/tracabilite/route";
import {
  PUT as updateTrace,
} from "@/app/api/operations/[id]/tracabilite/[traceId]/route";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Site } from "@/backend/clients-sites/infrastructure/mongoose/site.model";
import { Equipe } from "@/backend/equipes/infrastructure/mongoose/equipe.model";
import { Operation } from "@/backend/operations/infrastructure/mongoose/operation.model";
import { TraceabiliteModel } from "@/backend/tracabilite/infrastructure/mongoose/tracabilite.model";
import { IdentiteEntrepriseModel } from "@/backend/identite-entreprise/infrastructure/mongoose/identite-entreprise.model";

const ID_ACTEUR = "507f1f77bcf86cd799439011";
const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`http://localhost:3000${url}`, init);
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const traceParams = (id: string, traceId: string) => ({
  params: Promise.resolve({ id, traceId }),
});
const body = {
  identifiantSuivi: "BSD-2026-001",
  typeDechet: "Huiles usagées",
  volume: 250,
  unite: "Litres",
  traitement: "Valorisation matière",
};

describe("API de traçabilité", () => {
  let operationId: string;
  let autreOperationId: string;
  let equipeId: string;

  const session = (role: string, rattachements: Record<string, string> = {}) =>
    vi.mocked(nextAuth.getServerSession).mockResolvedValue({
      user: {
        id: ID_ACTEUR,
        name: "Agent SRH",
        email: "agent@srh.ci",
        role,
        ...rattachements,
      },
    } as never);

  beforeEach(async () => {
    vi.resetAllMocks();
    await TraceabiliteModel.init();
    const client = await Client.create({ nom: "Client A" });
    const site = await Site.create({ clientId: client._id, nom: "Site A" });
    const equipe = await Equipe.create({ nom: "Équipe A" });
    equipeId = String(equipe._id);

    const creerOperation = async (equipe?: string) => {
      const operation = await Operation.create({
        clientId: client._id,
        siteId: site._id,
        natureIntervention: "Collecte",
        dateHeurePrevue: new Date("2026-10-19T10:00:00.000Z"),
        statut: "En cours",
        ...(equipe ? { equipeId: equipe } : {}),
      });
      return String(operation._id);
    };
    operationId = await creerOperation(equipeId);
    autreOperationId = await creerOperation();
  });

  it("permet la saisie terrain et l'affichage peuplé pour la direction", async () => {
    session("chauffeur", { equipeId });
    const created = await createForOperation(
      req(`/api/operations/${operationId}/tracabilite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      params(operationId)
    );
    expect(created.status).toBe(201);
    const trace = await created.json();
    expect(trace.identifiantSuivi).toBe("BSD-2026-001");
    expect(trace.operationId).toBe(operationId);

    session("lecture");
    const response = await listAll();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].operation.client.nom).toBe("Client A");
    expect(data.items[0].operation.site.nom).toBe("Site A");
  });

  it("impose l'unité globale à une nouvelle ligne de traçabilité", async () => {
    await IdentiteEntrepriseModel.create({
      cle: "principale",
      nomEntreprise: "Entreprise Exemple",
      sigle: "EX",
      uniteQuantiteGlobale: "Kg",
    });
    session("admin");

    const response = await createForOperation(
      req(`/api/operations/${operationId}/tracabilite`, {
        method: "POST",
        body: JSON.stringify({ ...body, unite: "Litres" }),
      }),
      params(operationId)
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ volume: 250, unite: "Kg" });
    expect(await TraceabiliteModel.findOne({ operationId }).lean()).toMatchObject({ unite: "Kg" });
  });

  it("préserve l'unité historique si le volume reste identique et applique la globale si le volume change", async () => {
    session("admin");
    const created = await createForOperation(
      req(`/api/operations/${operationId}/tracabilite`, {
        method: "POST",
        body: JSON.stringify({ ...body, unite: "Bacs" }),
      }),
      params(operationId)
    );
    const traceId = (await created.json()).id;
    await IdentiteEntrepriseModel.create({
      cle: "principale",
      nomEntreprise: "Entreprise Exemple",
      sigle: "EX",
      uniteQuantiteGlobale: "M3",
    });

    const unchanged = await updateTrace(
      req(`/api/operations/${operationId}/tracabilite/${traceId}`, {
        method: "PUT",
        body: JSON.stringify({ ...body, unite: "Kg" }),
      }),
      traceParams(operationId, traceId)
    );
    expect((await unchanged.json()).unite).toBe("Bacs");

    const changed = await updateTrace(
      req(`/api/operations/${operationId}/tracabilite/${traceId}`, {
        method: "PUT",
        body: JSON.stringify({ ...body, volume: 300, unite: "Kg" }),
      }),
      traceParams(operationId, traceId)
    );
    expect((await changed.json())).toMatchObject({ volume: 300, unite: "M3" });
  });

  it("refuse les identifiants dupliqués sans tenir compte de la casse", async () => {
    session("admin");
    await createForOperation(
      req(`/api/operations/${operationId}/tracabilite`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
      params(operationId)
    );
    const duplicate = await createForOperation(
      req(`/api/operations/${operationId}/tracabilite`, {
        method: "POST",
        body: JSON.stringify({ ...body, identifiantSuivi: "bsd-2026-001" }),
      }),
      params(operationId)
    );
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error).toContain("déjà utilisé");
  });

  it("autorise la lecture seule mais interdit sa création et protège le périmètre équipe", async () => {
    session("admin");
    const item = await createForOperation(
      req(`/api/operations/${operationId}/tracabilite`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
      params(operationId)
    );
    const traceId = (await item.json()).id;

    session("lecture");
    expect((await listForOperation(req(`/api/operations/${operationId}/tracabilite`), params(operationId))).status).toBe(200);
    expect(
      (
        await createForOperation(
          req(`/api/operations/${operationId}/tracabilite`, {
            method: "POST",
            body: JSON.stringify({ ...body, identifiantSuivi: "BSD-2026-002" }),
          }),
          params(operationId)
        )
      ).status
    ).toBe(403);

    session("chauffeur", { equipeId });
    expect((await listForOperation(req(`/api/operations/${autreOperationId}/tracabilite`), params(autreOperationId))).status).toBe(404);
    expect((await listAll()).status).toBe(403);
    expect(traceId).toMatch(/^[\da-f]{24}$/i);
  });

  it("refuse l'accès des comptes client à la traçabilité", async () => {
    session("client", { clientId: "507f1f77bcf86cd799439015" });

    expect(
      (await listForOperation(req(`/api/operations/${operationId}/tracabilite`), params(operationId))).status
    ).toBe(403);
    expect((await listAll()).status).toBe(403);
    expect(
      (
        await createForOperation(
          req(`/api/operations/${operationId}/tracabilite`, {
            method: "POST",
            body: JSON.stringify(body),
          }),
          params(operationId)
        )
      ).status
    ).toBe(403);
  });

  it("met à jour une ligne uniquement dans son opération sans autoriser sa suppression", async () => {
    session("dispatcher");
    const created = await createForOperation(
      req(`/api/operations/${operationId}/tracabilite`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
      params(operationId)
    );
    const traceId = (await created.json()).id;

    const conflict = await updateTrace(
      req(`/api/operations/${autreOperationId}/tracabilite/${traceId}`, {
        method: "PUT",
        body: JSON.stringify({ ...body, identifiantSuivi: "BSD-2026-002" }),
      }),
      traceParams(autreOperationId, traceId)
    );
    expect(conflict.status).toBe(404);

    const updated = await updateTrace(
      req(`/api/operations/${operationId}/tracabilite/${traceId}`, {
        method: "PUT",
        body: JSON.stringify({ ...body, volume: 300 }),
      }),
      traceParams(operationId, traceId)
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).volume).toBe(300);

    expect(await TraceabiliteModel.countDocuments()).toBe(1);
  });

  it("refuse les charges invalides et les lignes d'opérations inexistantes", async () => {
    session("admin");
    const invalid = await createForOperation(
      req(`/api/operations/${operationId}/tracabilite`, {
        method: "POST",
        body: JSON.stringify({ ...body, volume: 0 }),
      }),
      params(operationId)
    );
    expect(invalid.status).toBe(400);

    const missingOperationId = String(new mongoose.Types.ObjectId());
    const notFound = await createForOperation(
      req(`/api/operations/${missingOperationId}/tracabilite`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
      params(missingOperationId)
    );
    expect(notFound.status).toBe(404);
    expect(await TraceabiliteModel.countDocuments()).toBe(0);
  });
});
