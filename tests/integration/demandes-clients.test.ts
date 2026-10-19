import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";
import { POST as soumettreDemandePublique } from "@/app/api/demandes/publiques/route";
import { GET as listerDemandes } from "@/app/api/demandes/route";
import { POST as convertirDemande } from "@/app/api/demandes/[id]/convertir/route";
import { POST as refuserDemande } from "@/app/api/demandes/[id]/refuser/route";
import { GET as listerOperationsClient } from "@/app/api/espace-client/operations/route";
import { GET as dashboardClient } from "@/app/api/espace-client/dashboard/route";
import { GET as listerSitesClient } from "@/app/api/espace-client/sites/route";
import { POST as soumettreOperationClient } from "@/app/api/espace-client/demandes/route";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Site } from "@/backend/clients-sites/infrastructure/mongoose/site.model";
import { Operation } from "@/backend/operations/infrastructure/mongoose/operation.model";
import { creerOperationDemande } from "@/backend/operations";
import { DemandePubliqueModel } from "@/backend/demandes-clients/infrastructure/mongoose/demande-publique.model";
import type { IDemandePublique } from "@/backend/demandes-clients/infrastructure/mongoose/demande-publique.model";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

const UTILISATEUR_ID = "507f1f77bcf86cd799439011";

function mockSession(user: Record<string, unknown>) {
  vi.mocked(nextAuth.getServerSession).mockResolvedValue({
    user: { id: UTILISATEUR_ID, name: "Test SRH", email: "dispatcher@srh.ci", ...user },
  } as never);
}

function futureDate() {
  return new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
}

function requetePublique(email = "contact@example.ci", ip = "203.0.113.10") {
  return new NextRequest("http://localhost:3000/api/demandes/publiques", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": ip },
    body: JSON.stringify({
      nomClient: "Entreprise Exemple",
      nomContact: "Awa Test",
      email,
      telephone: "+225 01 02 03 04",
      nomSite: "Usine Nord",
      adresseSite: "Abidjan, Côte d’Ivoire",
      natureIntervention: "Collecte de déchets",
      dateSouhaitee: futureDate(),
      informationsParticulieres: "Accès par le portail principal.",
    }),
  });
}

function requeteAction(path: string, body: unknown) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function creerClientEtSite(nom: string) {
  const client = await Client.create({ nom });
  const site = await Site.create({
    clientId: client._id,
    nom: `Site ${nom}`,
    adresse: "Abidjan",
    observations: "Information interne",
  });
  return { client, site };
}

describe("demandes publiques", () => {
  beforeEach(() => vi.resetAllMocks());

  it("accepte une demande publique sans session et la conserve en attente sans créer d’opération", async () => {
    const response = await soumettreDemandePublique(requetePublique("Contact@Example.ci"));

    expect(response.status).toBe(202);
    expect(nextAuth.getServerSession).not.toHaveBeenCalled();
    const demande = await DemandePubliqueModel.findOne({ email: "contact@example.ci" }).lean<IDemandePublique>();
    expect(demande?.statut).toBe("en_attente");
    expect(demande?.nomClient).toBe("Entreprise Exemple");
    expect(await Operation.countDocuments()).toBe(0);
  });

  it("applique une limite par adresse IP aux soumissions valides", async () => {
    for (let index = 0; index < 5; index += 1) {
      const response = await soumettreDemandePublique(
        requetePublique(`contact${index}@example.ci`, "203.0.113.11")
      );
      expect(response.status).toBe(202);
    }

    const limited = await soumettreDemandePublique(requetePublique("another@example.ci", "203.0.113.11"));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    expect(await DemandePubliqueModel.countDocuments()).toBe(5);
  });

  it("limite aussi le nombre de demandes par adresse e-mail", async () => {
    for (let index = 0; index < 3; index += 1) {
      const response = await soumettreDemandePublique(
        requetePublique("repeat@example.ci", `203.0.113.${20 + index}`)
      );
      expect(response.status).toBe(202);
    }

    const limited = await soumettreDemandePublique(
      requetePublique("repeat@example.ci", "203.0.113.24")
    );
    expect(limited.status).toBe(429);
    expect(await DemandePubliqueModel.countDocuments()).toBe(3);
  });

  it("refuse un contrôle de débit impossible et borne la taille du corps public", async () => {
    const withoutIp = await soumettreDemandePublique(
      new NextRequest("http://localhost:3000/api/demandes/publiques", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    );
    expect(withoutIp.status).toBe(503);

    const tooLarge = await soumettreDemandePublique(
      new NextRequest("http://localhost:3000/api/demandes/publiques", {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": "203.0.113.40" },
        body: "x".repeat(17_000),
      })
    );
    expect(tooLarge.status).toBe(413);
    expect(await DemandePubliqueModel.countDocuments()).toBe(0);
  });

  it("réserve la boîte de demandes aux rôles qui peuvent qualifier", async () => {
    const anonymous = await listerDemandes();
    expect(anonymous.status).toBe(401);

    mockSession({ role: "lecture" });
    const denied = await listerDemandes();
    expect(denied.status).toBe(403);

    mockSession({ role: "client", clientId: "507f1f77bcf86cd799439022" });
    const clientDenied = await listerDemandes();
    expect(clientDenied.status).toBe(403);

    mockSession({ role: "dispatcher" });
    const allowed = await listerDemandes();
    expect(allowed.status).toBe(200);
  });

  it("vérifie le rattachement du site et convertit une seule fois en opération Demande", async () => {
    const { client: clientA, site: siteA } = await creerClientEtSite("Client A");
    const { site: siteB } = await creerClientEtSite("Client B");
    await soumettreDemandePublique(requetePublique("convert@example.ci"));
    const demande = await DemandePubliqueModel.findOne({ email: "convert@example.ci" }).lean<IDemandePublique>();
    expect(demande).toBeTruthy();

    mockSession({ role: "dispatcher" });
    const incorrect = await convertirDemande(
      requeteAction(`/api/demandes/${demande!._id}/convertir`, {
        clientId: clientA._id.toString(),
        siteId: siteB._id.toString(),
      }),
      { params: Promise.resolve({ id: demande!._id.toString() }) }
    );
    expect(incorrect.status).toBe(400);
    expect(await Operation.countDocuments()).toBe(0);

    const converted = await convertirDemande(
      requeteAction(`/api/demandes/${demande!._id}/convertir`, {
        clientId: clientA._id.toString(),
        siteId: siteA._id.toString(),
      }),
      { params: Promise.resolve({ id: demande!._id.toString() }) }
    );
    expect(converted.status).toBe(200);
    const response = await converted.json();
    expect(response.statut).toBe("convertie");

    const operation = await Operation.findOne({ sourceDemandeId: demande!._id.toString() });
    expect(operation?.statut).toBe("Demande");
    expect(operation?.clientId.toString()).toBe(clientA._id.toString());
    expect(operation?.siteId.toString()).toBe(siteA._id.toString());

    const repeated = await convertirDemande(
      requeteAction(`/api/demandes/${demande!._id}/convertir`, {
        clientId: clientA._id.toString(),
        siteId: siteA._id.toString(),
      }),
      { params: Promise.resolve({ id: demande!._id.toString() }) }
    );
    expect(repeated.status).toBe(409);
    expect(await Operation.countDocuments()).toBe(1);
  });

  it("refuse une demande en gardant sa trace", async () => {
    await soumettreDemandePublique(requetePublique("refus@example.ci"));
    const demande = await DemandePubliqueModel.findOne({ email: "refus@example.ci" }).lean<IDemandePublique>();
    mockSession({ role: "admin" });

    const response = await refuserDemande(
      requeteAction(`/api/demandes/${demande!._id}/refuser`, { motif: "Zone non desservie." }),
      { params: Promise.resolve({ id: demande!._id.toString() }) }
    );

    expect(response.status).toBe(200);
    const refusee = await DemandePubliqueModel.findById(demande!._id).lean<IDemandePublique>();
    expect(refusee?.statut).toBe("refusee");
    expect(refusee?.motifRefus).toBe("Zone non desservie.");
    expect(refusee?.traiteePar?.toString()).toBe(UTILISATEUR_ID);
  });

  it("rend idempotente la création d’une opération issue de la même demande", async () => {
    const { client, site } = await creerClientEtSite("Client Idempotent");
    const saisie = {
      clientId: client._id.toString(),
      siteId: site._id.toString(),
      natureIntervention: "Collecte issue de demande",
      dateHeurePrevue: new Date(Date.now() + 24 * 60 * 60 * 1000),
      dureeEstimeeMinutes: 120,
      equipementIds: [],
      informationsParticulieres: "",
      uniteQuantite: "Litres" as const,
      remarquesTerrain: "",
      nomSignataireClient: "",
      signatureClient: "",
    };
    const first = await creerOperationDemande(saisie, UTILISATEUR_ID, "demande-publique-test");
    const repeated = await creerOperationDemande(saisie, UTILISATEUR_ID, "demande-publique-test");

    expect(repeated.id).toBe(first.id);
    expect(await Operation.countDocuments({ sourceDemandeId: "demande-publique-test" })).toBe(1);
  });
});

describe("portail client", () => {
  beforeEach(() => vi.resetAllMocks());

  it("limite les opérations au client connecté et ne renvoie pas les champs internes", async () => {
    const { client: clientA, site: siteA } = await creerClientEtSite("Client A");
    const { client: clientB, site: siteB } = await creerClientEtSite("Client B");
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await Operation.create({
      clientId: clientA._id,
      siteId: siteA._id,
      natureIntervention: "Collecte A",
      dateHeurePrevue: date,
      statut: "Demande",
      informationsParticulieres: "Confidentiel interne",
    });
    await Operation.create({
      clientId: clientB._id,
      siteId: siteB._id,
      natureIntervention: "Collecte B",
      dateHeurePrevue: date,
      statut: "En cours",
    });
    mockSession({ role: "client", clientId: clientA._id.toString() });

    const response = await listerOperationsClient(
      new NextRequest("http://localhost:3000/api/espace-client/operations")
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(1);
    expect(data.items).toHaveLength(1);
    expect(data.items[0].natureIntervention).toBe("Collecte A");
    expect(data.items[0].siteId.nom).toBe("Site Client A");
    expect(data.items[0]).not.toHaveProperty("clientId");
    expect(data.items[0]).not.toHaveProperty("equipeId");
    expect(data.items[0]).not.toHaveProperty("historiqueStatuts");
    expect(data.items[0]).not.toHaveProperty("informationsParticulieres");

    const sitesResponse = await listerSitesClient();
    expect(sitesResponse.status).toBe(200);
    const sites = await sitesResponse.json();
    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({ id: siteA._id.toString(), nom: "Site Client A" });
    expect(sites[0]).not.toHaveProperty("observations");

    const dashboardResponse = await dashboardClient();
    const dashboard = await dashboardResponse.json();
    expect(dashboard.total).toBe(1);
    expect(dashboard.demandesEnAttente).toBe(1);
    expect(dashboard.recent[0]).not.toHaveProperty("informationsParticulieres");
  });

  it("ignore les rattachements client envoyés par le navigateur et refuse les sites externes", async () => {
    const { client: clientA, site: siteA } = await creerClientEtSite("Client A");
    const { site: siteB } = await creerClientEtSite("Client B");
    mockSession({ role: "client", clientId: clientA._id.toString() });

    const crossClient = await soumettreOperationClient(
      requeteAction("/api/espace-client/demandes", {
        siteId: siteB._id.toString(),
        natureIntervention: "Collecte externe",
        dateSouhaitee: futureDate(),
      })
    );
    expect(crossClient.status).toBe(404);

    const spoofedClient = await soumettreOperationClient(
      requeteAction("/api/espace-client/demandes", {
        clientId: siteB.clientId.toString(),
        siteId: siteA._id.toString(),
        natureIntervention: "Collecte falsifiée",
        dateSouhaitee: futureDate(),
      })
    );
    expect(spoofedClient.status).toBe(400);
    expect(await Operation.countDocuments()).toBe(0);

    const accepted = await soumettreOperationClient(
      requeteAction("/api/espace-client/demandes", {
        siteId: siteA._id.toString(),
        natureIntervention: "Collecte client",
        dateSouhaitee: futureDate(),
      })
    );
    expect(accepted.status).toBe(201);
    const created = await Operation.findOne({ natureIntervention: "Collecte client" });
    expect(created?.clientId.toString()).toBe(clientA._id.toString());
    expect(created?.siteId.toString()).toBe(siteA._id.toString());
    expect(created?.statut).toBe("Demande");
  });
});
