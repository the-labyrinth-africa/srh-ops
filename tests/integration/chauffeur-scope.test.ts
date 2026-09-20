import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { GET as listOperations } from "@/app/api/operations/route";
import { GET as getOperation } from "@/app/api/operations/[id]/route";
import { GET as getRapport } from "@/app/api/operations/[id]/rapport/route";
import { PATCH as updateStatus } from "@/app/api/operations/[id]/statut/route";
import { GET as getPlanning } from "@/app/api/operations/planning/route";
import { POST as addPhoto, DELETE as removePhoto } from "@/app/api/operations/[id]/photos/route";
import { GET as getEquipes } from "@/app/api/equipes/route";
import { GET as getVehicules } from "@/app/api/vehicules/route";
import { GET as getRecurrences } from "@/app/api/recurrences/route";
import { GET as getEquipements } from "@/app/api/equipements/route";
import { GET as getStats } from "@/app/api/dashboard/stats/route";
import { Client } from "@/models/Client";
import { Site } from "@/models/Site";
import { Equipe } from "@/models/Equipe";
import { Operation } from "@/models/Operation";

function mockSession(user: Record<string, unknown>) {
  vi.mocked(nextAuth.getServerSession).mockResolvedValue({
    user: { id: "507f1f77bcf86cd799439011", name: "T", email: "t@srh.ci", username: "t", ...user },
  } as never);
}

async function seed() {
  const client = await Client.create({ nom: "Client A" });
  const site = await Site.create({ clientId: client._id, nom: "Site A" });
  const equipeA = await Equipe.create({ nom: "A" });
  const equipeB = await Equipe.create({ nom: "B" });
  const mk = (equipeId?: unknown) =>
    Operation.create({
      clientId: client._id, siteId: site._id, natureIntervention: "Collecte",
      dateHeurePrevue: new Date(2026, 5, 15), statut: "En cours", ...(equipeId ? { equipeId } : {}),
    });
  return { equipeA, equipeB, opA: await mk(equipeA._id), opB: await mk(equipeB._id), opFree: await mk() };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`http://localhost:3000${url}`, init);

describe("chauffeur : périmètre d'équipe (fermé par défaut)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("un chauffeur sans équipe en session est refusé partout où il agirait sur des opérations", async () => {
    const { opA } = await seed();
    mockSession({ role: "chauffeur" });

    expect((await listOperations(req("/api/operations"))).status).toBe(403);
    expect((await getOperation(req(`/api/operations/${opA._id}`), params(String(opA._id)))).status).toBe(403);
    const patch = await updateStatus(
      req(`/api/operations/${opA._id}/statut`, { method: "PATCH", body: JSON.stringify({ statut: "Terminée", quantiteCollectee: 5 }) }),
      params(String(opA._id))
    );
    expect(patch.status).toBe(403);
    expect((await Operation.findById(opA._id))?.statut).toBe("En cours");
  });

  it("un chauffeur d'équipe A ne lit que les opérations de son équipe (liste, détail, rapport)", async () => {
    const { equipeA, opA, opB, opFree } = await seed();
    mockSession({ role: "chauffeur", equipeId: String(equipeA._id) });

    const list = await (await listOperations(req("/api/operations?equipeId=" + opB.equipeId))).json();
    expect(list.items.map((o: { _id: string }) => String(o._id))).toEqual([String(opA._id)]);

    expect((await getOperation(req(`/api/operations/${opA._id}`), params(String(opA._id)))).status).toBe(200);
    expect((await getOperation(req(`/api/operations/${opB._id}`), params(String(opB._id)))).status).toBe(404);
    expect((await getOperation(req(`/api/operations/${opFree._id}`), params(String(opFree._id)))).status).toBe(404);
    expect((await getRapport(req(`/api/operations/${opB._id}/rapport`), params(String(opB._id)))).status).toBe(404);
  });

  it("le refus d'équipe utilise le message exact", async () => {
    const { equipeA, opB } = await seed();
    mockSession({ role: "chauffeur", equipeId: String(equipeA._id) });
    const res = await updateStatus(
      req(`/api/operations/${opB._id}/statut`, { method: "PATCH", body: JSON.stringify({ statut: "Terminée", quantiteCollectee: 5 }) }),
      params(String(opB._id))
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Opération non affectée à votre équipe");
  });

  it.each([
    ["équipes", getEquipes, "/api/equipes"],
    ["véhicules", getVehicules, "/api/vehicules"],
    ["équipements", getEquipements, "/api/equipements"],
    ["récurrences", getRecurrences, "/api/recurrences"],
    ["statistiques", getStats, "/api/dashboard/stats"],
  ])("un chauffeur n'accède pas à %s", async (_n, handler, url) => {
    const { equipeA } = await seed();
    mockSession({ role: "chauffeur", equipeId: String(equipeA._id) });
    expect((await (handler as (r: NextRequest) => Promise<Response>)(req(url))).status).toBe(403);
  });

  it("le planning est fermé par défaut et limité à l'équipe du chauffeur", async () => {
    const { equipeA, opA } = await seed();

    mockSession({ role: "chauffeur" });
    expect((await getPlanning(req("/api/operations/planning"))).status).toBe(403);

    mockSession({ role: "chauffeur", equipeId: String(equipeA._id) });
    const res = await getPlanning(req("/api/operations/planning"));
    expect(res.status).toBe(200);
    expect((await res.json()).map((e: { id: string }) => e.id)).toEqual([String(opA._id)]);
  });

  it("les photos d'une opération d'une autre équipe (ou sans équipe en session) restent intactes", async () => {
    const { equipeA, opB } = await seed();
    const photo = "data:image/png;base64,AAAA";
    await Operation.updateOne({ _id: opB._id }, { $push: { photos: { url: photo, nom: "p.png" } } });

    for (const session of [{ role: "chauffeur", equipeId: String(equipeA._id) }, { role: "chauffeur" }]) {
      mockSession(session);
      const post = await addPhoto(
        req(`/api/operations/${opB._id}/photos`, { method: "POST", body: JSON.stringify({ photo }) }),
        params(String(opB._id))
      );
      expect(post.status).toBe(403);
      expect((await post.json()).error).toBe("Opération non affectée à votre équipe");

      const del = await removePhoto(
        req(`/api/operations/${opB._id}/photos`, { method: "DELETE", body: JSON.stringify({ url: photo }) }),
        params(String(opB._id))
      );
      expect(del.status).toBe(403);
      expect((await del.json()).error).toBe("Opération non affectée à votre équipe");
    }
    expect((await Operation.findById(opB._id))?.photos).toHaveLength(1);
  });

  it("une opération non affectée n'est modifiable par aucun chauffeur", async () => {
    const { equipeA, opFree } = await seed();
    mockSession({ role: "chauffeur", equipeId: String(equipeA._id) });
    const res = await updateStatus(
      req(`/api/operations/${opFree._id}/statut`, { method: "PATCH", body: JSON.stringify({ statut: "Terminée", quantiteCollectee: 5 }) }),
      params(String(opFree._id))
    );
    expect(res.status).toBe(403);
    expect((await Operation.findById(opFree._id))?.statut).toBe("En cours");
  });
});
