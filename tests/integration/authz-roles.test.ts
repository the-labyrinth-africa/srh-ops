import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { PATCH as updateStatus } from "@/app/api/operations/[id]/statut/route";
import { POST as uploadPhoto, DELETE as deletePhoto } from "@/app/api/operations/[id]/photos/route";
import { GET as getOperations } from "@/app/api/operations/route";
import { GET as getOperationById } from "@/app/api/operations/[id]/route";
import { GET as getRapport } from "@/app/api/operations/[id]/rapport/route";
import { GET as getClients } from "@/app/api/clients/route";
import { GET as getClientById } from "@/app/api/clients/[id]/route";
import { GET as getSites } from "@/app/api/sites/route";
import { GET as getSiteById } from "@/app/api/sites/[id]/route";
import { GET as getRecurrences } from "@/app/api/recurrences/route";
import { GET as getEquipes } from "@/app/api/equipes/route";
import { GET as getVehicules } from "@/app/api/vehicules/route";
import { GET as getEquipements } from "@/app/api/equipements/route";
import { GET as getUsers } from "@/app/api/users/route";
import { GET as getStats } from "@/app/api/dashboard/stats/route";
import { POST as importExcel } from "@/app/api/import/route";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Site } from "@/models/Site";
import { Equipe } from "@/backend/equipes/infrastructure/mongoose/equipe.model";
import { Operation } from "@/models/Operation";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function mockSession(user: Record<string, unknown>) {
  vi.mocked(nextAuth.getServerSession).mockResolvedValue({
    user: { id: "507f1f77bcf86cd799439011", name: "Test", email: "t@srh.ci", ...user },
  } as never);
}

async function seedTwoClients() {
  const clientA = await Client.create({ nom: "Client A" });
  const clientB = await Client.create({ nom: "Client B" });
  const siteA = await Site.create({ clientId: clientA._id, nom: "Site A" });
  const siteB = await Site.create({ clientId: clientB._id, nom: "Site B" });
  const opA = await Operation.create({
    clientId: clientA._id,
    siteId: siteA._id,
    natureIntervention: "Collecte A",
    dateHeurePrevue: new Date(2026, 5, 15),
    statut: "En cours",
  });
  const opB = await Operation.create({
    clientId: clientB._id,
    siteId: siteB._id,
    natureIntervention: "Collecte B",
    dateHeurePrevue: new Date(2026, 5, 15),
    statut: "Rapportée",
    quantiteCollectee: 100,
  });
  return { clientA, clientB, siteA, siteB, opA, opB };
}

describe("Autorisations par rôle (écriture terrain)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("refuse le changement de statut au rôle lecture", async () => {
    const { opA } = await seedTwoClients();
    mockSession({ role: "lecture" });

    const res = await updateStatus(
      new NextRequest(`http://localhost:3000/api/operations/${opA._id}/statut`, {
        method: "PATCH",
        body: JSON.stringify({ statut: "Terminée", quantiteCollectee: 10 }),
      }),
      { params: Promise.resolve({ id: opA._id.toString() }) }
    );

    expect(res.status).toBe(403);
    const after = await Operation.findById(opA._id);
    expect(after!.statut).toBe("En cours");
    expect(after!.quantiteCollectee).toBeUndefined();
  });

  it("refuse le changement de statut au rôle client", async () => {
    const { clientA, opA } = await seedTwoClients();
    mockSession({ role: "client", clientId: clientA._id.toString() });

    const res = await updateStatus(
      new NextRequest(`http://localhost:3000/api/operations/${opA._id}/statut`, {
        method: "PATCH",
        body: JSON.stringify({ statut: "Terminée" }),
      }),
      { params: Promise.resolve({ id: opA._id.toString() }) }
    );

    expect(res.status).toBe(403);
  });

  it("refuse l'ajout et la suppression de photos aux rôles lecture et client", async () => {
    const { clientA, opA } = await seedTwoClients();

    mockSession({ role: "lecture" });
    const resPost = await uploadPhoto(
      new NextRequest(`http://localhost:3000/api/operations/${opA._id}/photos`, {
        method: "POST",
        body: JSON.stringify({ photo: PNG, nom: "x.png" }),
      }),
      { params: Promise.resolve({ id: opA._id.toString() }) }
    );
    expect(resPost.status).toBe(403);

    const resDel = await deletePhoto(
      new NextRequest(`http://localhost:3000/api/operations/${opA._id}/photos`, {
        method: "DELETE",
        body: JSON.stringify({ url: PNG }),
      }),
      { params: Promise.resolve({ id: opA._id.toString() }) }
    );
    expect(resDel.status).toBe(403);

    mockSession({ role: "client", clientId: clientA._id.toString() });
    const resPostClient = await uploadPhoto(
      new NextRequest(`http://localhost:3000/api/operations/${opA._id}/photos`, {
        method: "POST",
        body: JSON.stringify({ photo: PNG, nom: "x.png" }),
      }),
      { params: Promise.resolve({ id: opA._id.toString() }) }
    );
    expect(resPostClient.status).toBe(403);

    expect((await Operation.findById(opA._id))!.photos.length).toBe(0);
  });

  it("laisse le rôle lecture consulter opérations et rapport", async () => {
    const { opA } = await seedTwoClients();
    mockSession({ role: "lecture" });

    const resOp = await getOperationById(
      new NextRequest(`http://localhost:3000/api/operations/${opA._id}`),
      { params: Promise.resolve({ id: opA._id.toString() }) }
    );
    expect(resOp.status).toBe(200);

    const resRapport = await getRapport(
      new NextRequest(`http://localhost:3000/api/operations/${opA._id}/rapport`),
      { params: Promise.resolve({ id: opA._id.toString() }) }
    );
    expect(resRapport.status).toBe(200);
    expect(resRapport.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("laisse un client lire le rapport de sa propre opération", async () => {
    const { clientA, opA } = await seedTwoClients();
    mockSession({ role: "client", clientId: clientA._id.toString() });

    const res = await getRapport(
      new NextRequest(`http://localhost:3000/api/operations/${opA._id}/rapport`),
      { params: Promise.resolve({ id: opA._id.toString() }) }
    );
    expect(res.status).toBe(200);
  });

  it("autorise un chauffeur sur les opérations de son équipe et refuse celles des autres", async () => {
    const client = await Client.create({ nom: "Client Chauffeur" });
    const site = await Site.create({ clientId: client._id, nom: "Site Chauffeur" });
    const equipeA = await Equipe.create({ nom: "Équipe A" });
    const equipeB = await Equipe.create({ nom: "Équipe B" });

    const opEquipeA = await Operation.create({
      clientId: client._id,
      siteId: site._id,
      natureIntervention: "Collecte équipe A",
      dateHeurePrevue: new Date(2026, 5, 15),
      equipeId: equipeA._id,
      statut: "En cours",
    });
    const opEquipeB = await Operation.create({
      clientId: client._id,
      siteId: site._id,
      natureIntervention: "Collecte équipe B",
      dateHeurePrevue: new Date(2026, 5, 15),
      equipeId: equipeB._id,
      statut: "En cours",
    });

    mockSession({ role: "chauffeur", equipeId: equipeA._id.toString() });

    const resOwn = await updateStatus(
      new NextRequest(`http://localhost:3000/api/operations/${opEquipeA._id}/statut`, {
        method: "PATCH",
        body: JSON.stringify({ statut: "Terminée", quantiteCollectee: 500 }),
      }),
      { params: Promise.resolve({ id: opEquipeA._id.toString() }) }
    );
    expect(resOwn.status).toBe(200);

    const resOther = await updateStatus(
      new NextRequest(`http://localhost:3000/api/operations/${opEquipeB._id}/statut`, {
        method: "PATCH",
        body: JSON.stringify({ statut: "Terminée", quantiteCollectee: 500 }),
      }),
      { params: Promise.resolve({ id: opEquipeB._id.toString() }) }
    );
    expect(resOther.status).toBe(403);
    expect((await Operation.findById(opEquipeB._id))!.statut).toBe("En cours");
  });
});

describe("Isolation du rôle client (clientId)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("ne liste que les opérations de son propre client, même si la requête cible un autre client", async () => {
    const { clientA, clientB } = await seedTwoClients();
    mockSession({ role: "client", clientId: clientA._id.toString() });

    const res = await getOperations(
      new NextRequest(`http://localhost:3000/api/operations?clientId=${clientB._id}`)
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(1);
    expect(data.items[0].natureIntervention).toBe("Collecte A");
  });

  it("ne peut pas lire l'opération ni le rapport d'un autre client", async () => {
    const { clientA, opB } = await seedTwoClients();
    mockSession({ role: "client", clientId: clientA._id.toString() });

    const resOp = await getOperationById(
      new NextRequest(`http://localhost:3000/api/operations/${opB._id}`),
      { params: Promise.resolve({ id: opB._id.toString() }) }
    );
    expect(resOp.status).toBe(404);

    const resRapport = await getRapport(
      new NextRequest(`http://localhost:3000/api/operations/${opB._id}/rapport`),
      { params: Promise.resolve({ id: opB._id.toString() }) }
    );
    expect(resRapport.status).toBe(404);
  });

  it("ne voit que son propre client et ses propres sites", async () => {
    const { clientA, clientB, siteB } = await seedTwoClients();
    mockSession({ role: "client", clientId: clientA._id.toString() });

    const resClients = await getClients();
    const clients = await resClients.json();
    expect(clients).toHaveLength(1);
    expect(clients[0].nom).toBe("Client A");

    const resOther = await getClientById(
      new NextRequest(`http://localhost:3000/api/clients/${clientB._id}`),
      { params: Promise.resolve({ id: clientB._id.toString() }) }
    );
    expect(resOther.status).toBe(404);

    const resSites = await getSites(
      new NextRequest(`http://localhost:3000/api/sites?clientId=${clientB._id}`)
    );
    const sites = await resSites.json();
    expect(sites).toHaveLength(1);
    expect(sites[0].nom).toBe("Site A");

    const resSiteOther = await getSiteById(
      new NextRequest(`http://localhost:3000/api/sites/${siteB._id}`),
      { params: Promise.resolve({ id: siteB._id.toString() }) }
    );
    expect(resSiteOther.status).toBe(404);
  });

  it("reçoit 403 sur les routes internes", async () => {
    const { clientA } = await seedTwoClients();
    mockSession({ role: "client", clientId: clientA._id.toString() });

    expect((await getRecurrences(new NextRequest("http://localhost:3000/api/recurrences"))).status).toBe(403);
    expect((await getEquipes()).status).toBe(403);
    expect((await getVehicules()).status).toBe(403);
    expect((await getEquipements()).status).toBe(403);
    expect((await getUsers(new NextRequest("http://localhost:3000/api/users"))).status).toBe(403);
    expect((await getStats()).status).toBe(403);

    const resImport = await importExcel(
      new NextRequest("http://localhost:3000/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "preview" }),
      })
    );
    expect(resImport.status).toBe(403);
  });

  it("refuse partout un compte client sans clientId en session", async () => {
    const { opA, clientA } = await seedTwoClients();
    mockSession({ role: "client" });

    expect((await getOperations(new NextRequest("http://localhost:3000/api/operations"))).status).toBe(403);
    expect((await getClients()).status).toBe(403);
    expect(
      (
        await getOperationById(new NextRequest(`http://localhost:3000/api/operations/${opA._id}`), {
          params: Promise.resolve({ id: opA._id.toString() }),
        })
      ).status
    ).toBe(403);
    expect(
      (
        await getClientById(new NextRequest(`http://localhost:3000/api/clients/${clientA._id}`), {
          params: Promise.resolve({ id: clientA._id.toString() }),
        })
      ).status
    ).toBe(403);
  });
});
