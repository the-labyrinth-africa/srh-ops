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
import { GET as getClients } from "@/app/api/clients/route";
import { GET as getClient } from "@/app/api/clients/[id]/route";
import { GET as getSites } from "@/app/api/sites/route";
import { GET as getSite } from "@/app/api/sites/[id]/route";
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

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

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
    expect((await patch.json()).error).toBe("Compte chauffeur sans équipe attribuée");
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

  const REFERENTIALS: [string, (r: NextRequest, c?: unknown) => Promise<Response>, string][] = [
    ["équipes", getEquipes as never, "/api/equipes"],
    ["véhicules", getVehicules as never, "/api/vehicules"],
    ["équipements", getEquipements as never, "/api/equipements"],
    ["récurrences", getRecurrences as never, "/api/recurrences"],
    ["statistiques", getStats as never, "/api/dashboard/stats"],
    ["clients", getClients as never, "/api/clients"],
    ["sites", getSites as never, "/api/sites"],
  ];

  it.each(REFERENTIALS)("un chauffeur (avec ou sans équipe) n'accède pas à %s", async (_n, handler, url) => {
    const { equipeA } = await seed();
    for (const session of [{ role: "chauffeur", equipeId: String(equipeA._id) }, { role: "chauffeur" }]) {
      mockSession(session);
      expect((await handler(req(url))).status).toBe(403);
    }
  });

  it("un chauffeur ne lit ni la fiche client ni la fiche site (avec ou sans équipe)", async () => {
    const { equipeA, opA } = await seed();
    const clientId = String(opA.clientId);
    const siteId = String(opA.siteId);
    for (const session of [{ role: "chauffeur", equipeId: String(equipeA._id) }, { role: "chauffeur" }]) {
      mockSession(session);
      expect((await getClient(req(`/api/clients/${clientId}`), params(clientId))).status).toBe(403);
      expect((await getSite(req(`/api/sites/${siteId}`), params(siteId))).status).toBe(403);
    }
  });

  it("le personnel et un compte client lisent toujours clients et sites (dans leur périmètre)", async () => {
    const { opA } = await seed();
    const other = await Client.create({ nom: "Autre client" });
    const clientId = String(opA.clientId);
    const siteId = String(opA.siteId);

    for (const role of ["admin", "dispatcher", "lecture"]) {
      mockSession({ role });
      const clients = await (await getClients()).json();
      expect(clients).toHaveLength(2);
      expect((await getSites(req("/api/sites"))).status).toBe(200);
      expect((await getClient(req(`/api/clients/${clientId}`), params(clientId))).status).toBe(200);
      expect((await getSite(req(`/api/sites/${siteId}`), params(siteId))).status).toBe(200);
    }

    mockSession({ role: "client", clientId });
    const own = await (await getClients()).json();
    expect(own.map((c: { _id: string }) => String(c._id))).toEqual([clientId]);
    const sites = await (await getSites(req("/api/sites"))).json();
    expect(sites).toHaveLength(1);
    expect((await getClient(req(`/api/clients/${other._id}`), params(String(other._id)))).status).toBe(404);
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

    const cases: [Record<string, unknown>, string][] = [
      [{ role: "chauffeur", equipeId: String(equipeA._id) }, "Opération non affectée à votre équipe"],
      [{ role: "chauffeur" }, "Compte chauffeur sans équipe attribuée"],
    ];
    for (const [session, expected] of cases) {
      mockSession(session);
      const post = await addPhoto(
        req(`/api/operations/${opB._id}/photos`, { method: "POST", body: JSON.stringify({ photo }) }),
        params(String(opB._id))
      );
      expect(post.status).toBe(403);
      expect((await post.json()).error).toBe(expected);

      const del = await removePhoto(
        req(`/api/operations/${opB._id}/photos`, { method: "DELETE", body: JSON.stringify({ url: photo }) }),
        params(String(opB._id))
      );
      expect(del.status).toBe(403);
      expect((await del.json()).error).toBe(expected);
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

  it("un chauffeur d'équipe ajoute une photo et télécharge le rapport de sa propre opération", async () => {
    const { equipeA, opA } = await seed();
    mockSession({ role: "chauffeur", equipeId: String(equipeA._id) });

    const post = await addPhoto(
      req(`/api/operations/${opA._id}/photos`, { method: "POST", body: JSON.stringify({ photo: PNG, nom: "x.png" }) }),
      params(String(opA._id))
    );
    expect(post.status).toBe(201);
    expect((await Operation.findById(opA._id))?.photos).toHaveLength(1);

    const rapport = await getRapport(req(`/api/operations/${opA._id}/rapport`), params(String(opA._id)));
    expect(rapport.status).toBe(200);
    expect(rapport.headers.get("Content-Type")).toBe("application/pdf");
  });
});
