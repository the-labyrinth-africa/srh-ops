import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { GET as getClients, POST as createClient } from "@/app/api/clients/route";
import { GET as getClientById, PUT as updateClient, DELETE as deleteClient } from "@/app/api/clients/[id]/route";
import { GET as getSites, POST as createSite } from "@/app/api/sites/route";
import { GET as getEquipes, POST as createEquipe } from "@/app/api/equipes/route";
import { GET as getVehicules, POST as createVehicule } from "@/app/api/vehicules/route";
import { GET as getEquipements, POST as createEquipement } from "@/app/api/equipements/route";

describe("Référentiels CRUD API Integration Tests", () => {
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

  describe("Clients API", () => {
    it("should create, fetch, update and delete a client", async () => {
      // 1. Create
      const reqCreate = new NextRequest("http://localhost:3000/api/clients", {
        method: "POST",
        body: JSON.stringify({
          nom: "Clinique Centrale",
          contact: { telephone: "+22501020304", email: "contact@centrale.ci" },
        }),
      });

      const resCreate = await createClient(reqCreate);
      expect(resCreate.status).toBe(201);
      const created = await resCreate.json();
      expect(created._id).toBeDefined();
      expect(created.nom).toBe("Clinique Centrale");

      const clientId = created._id;

      // 2. Fetch list
      const resList = await getClients();
      expect(resList.status).toBe(200);
      const list = await resList.json();
      expect(list.some((c: any) => c._id === clientId)).toBe(true);

      // 3. Fetch single
      const resSingle = await getClientById(new NextRequest(`http://localhost:3000/api/clients/${clientId}`), {
        params: Promise.resolve({ id: clientId }),
      });
      expect(resSingle.status).toBe(200);
      const single = await resSingle.json();
      expect(single.nom).toBe("Clinique Centrale");

      // 4. Update
      const reqUpdate = new NextRequest(`http://localhost:3000/api/clients/${clientId}`, {
        method: "PUT",
        body: JSON.stringify({
          nom: "Clinique Centrale Modifiée",
          contact: { telephone: "+22501020304", email: "updated@centrale.ci" },
        }),
      });
      const resUpdate = await updateClient(reqUpdate, { params: Promise.resolve({ id: clientId }) });
      expect(resUpdate.status).toBe(200);
      const updated = await resUpdate.json();
      expect(updated.nom).toBe("Clinique Centrale Modifiée");

      // 5. Delete
      const resDelete = await deleteClient(new NextRequest(`http://localhost:3000/api/clients/${clientId}`), {
        params: Promise.resolve({ id: clientId }),
      });
      expect(resDelete.status).toBe(200);
    });
  });

  describe("Sites API (with Client cascade filter)", () => {
    it("should create sites and filter by clientId", async () => {
      // Create Client with valid contact
      const reqClient = new NextRequest("http://localhost:3000/api/clients", {
        method: "POST",
        body: JSON.stringify({
          nom: "Hôpital Pasteur",
          contact: { telephone: "+22505050505", email: "pasteur@srh.ci" },
        }),
      });
      const resClient = await createClient(reqClient);
      expect(resClient.status).toBe(201);
      const client = await resClient.json();

      // Create Site 1 for Client
      const reqSite1 = new NextRequest("http://localhost:3000/api/sites", {
        method: "POST",
        body: JSON.stringify({
          clientId: client._id,
          nom: "Site Urgences",
          adresse: "Cocody Rue 12",
          typeDechets: ["Médical"],
        }),
      });
      const resSite1 = await createSite(reqSite1);
      expect(resSite1.status).toBe(201);
      const site1 = await resSite1.json();

      // Filter sites by clientId
      const reqFilter = new NextRequest(`http://localhost:3000/api/sites?clientId=${client._id}`);
      const resFilter = await getSites(reqFilter);
      expect(resFilter.status).toBe(200);
      const sites = await resFilter.json();
      expect(sites).toHaveLength(1);
      expect(sites[0]._id).toBe(site1._id);
    });
  });

  describe("Équipes, Véhicules, Équipements API", () => {
    it("should perform CRUD on Equipes", async () => {
      const req = new NextRequest("http://localhost:3000/api/equipes", {
        method: "POST",
        body: JSON.stringify({
          nom: "Équipe Bravo",
          membres: ["Kouassi Jean", "Traoré Moussa"],
          disponibilite: true,
        }),
      });
      const res = await createEquipe(req);
      expect(res.status).toBe(201);
      const equipe = await res.json();
      expect(equipe.nom).toBe("Équipe Bravo");

      const resList = await getEquipes();
      expect(resList.status).toBe(200);
    });

    it("should perform CRUD on Véhicules", async () => {
      const req = new NextRequest("http://localhost:3000/api/vehicules", {
        method: "POST",
        body: JSON.stringify({
          identification: "4567-HX-02",
          type: "Camion Cisterne",
          capacite: 20,
          disponibilite: true,
        }),
      });
      const res = await createVehicule(req);
      expect(res.status).toBe(201);
      const vehicule = await res.json();
      expect(vehicule.identification).toBe("4567-HX-02");

      const resList = await getVehicules();
      expect(resList.status).toBe(200);
    });

    it("should perform CRUD on Équipements", async () => {
      const req = new NextRequest("http://localhost:3000/api/equipements", {
        method: "POST",
        body: JSON.stringify({
          nom: "Broyeur SRH-99",
          type: "Broyeur",
          disponibilite: true,
        }),
      });
      const res = await createEquipement(req);
      expect(res.status).toBe(201);
      const equipement = await res.json();
      expect(equipement.nom).toBe("Broyeur SRH-99");

      const resList = await getEquipements();
      expect(resList.status).toBe(200);
    });
  });
});
