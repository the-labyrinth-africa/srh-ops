import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
import { Client } from "@/models/Client";
import { Site } from "@/models/Site";
import { Equipe } from "@/backend/equipes/infrastructure/mongoose/equipe.model";
import { Vehicule } from "@/models/Vehicule";
import { Operation } from "@/models/Operation";
import { Recurrence } from "@/models/Recurrence";

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

  describe("Récurrences personnalisées — ancrage et conflits (I6, I7)", () => {
    const START = new Date(2026, 8, 1, 6, 0, 0);

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(START);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    async function seedRecurrence(extra: Record<string, unknown> = {}) {
      const client = await Client.create({ nom: "Client Récurrence" });
      const site = await Site.create({ clientId: client._id, nom: "Site Récurrence" });
      const rec = await Recurrence.create({
        clientId: client._id,
        siteId: site._id,
        natureIntervention: "Collecte tous les 7 jours",
        frequence: "personnalisee",
        intervalleJours: 7,
        heurePrevue: "08:00",
        dureeEstimeeMinutes: 120,
        active: true,
        ...extra,
      });
      return { client, site, rec };
    }

    function generate(horizonDays: number) {
      return generateOperations(
        new NextRequest("http://localhost:3000/api/recurrences/generate", {
          method: "POST",
          body: JSON.stringify({ horizonDays }),
        })
      );
    }

    it("ne génère que les occasions dues et ne glisse jamais (I6)", async () => {
      const { site } = await seedRecurrence();

      // Jour 0 : seule l'occurrence à J+7 tient dans un horizon de 10 jours
      const first = await (await generate(10)).json();
      expect(first.generatedCount).toBe(1);

      // Deuxième passage le même jour : rien de neuf
      const again = await (await generate(10)).json();
      expect(again.generatedCount).toBe(0);

      // Jour 1 puis jour 2 : l'occurrence suivante n'est pas encore due
      vi.setSystemTime(new Date(2026, 8, 2, 6, 0, 0));
      expect((await (await generate(10)).json()).generatedCount).toBe(0);
      vi.setSystemTime(new Date(2026, 8, 3, 6, 0, 0));
      expect((await (await generate(10)).json()).generatedCount).toBe(0);

      // Jour 8 : la suivante tombe exactement 7 jours après la précédente
      vi.setSystemTime(new Date(2026, 8, 9, 6, 0, 0));
      expect((await (await generate(10)).json()).generatedCount).toBe(1);

      const ops = await Operation.find({ siteId: site._id }).sort({ dateHeurePrevue: 1 });
      expect(ops).toHaveLength(2);
      expect(ops[0].dateHeurePrevue.getTime()).toBe(new Date(2026, 8, 8, 8, 0, 0).getTime());
      expect(ops[1].dateHeurePrevue.getTime()).toBe(new Date(2026, 8, 15, 8, 0, 0).getTime());
    });

    it("n'enregistre derniereGeneration que sur une occurrence réellement créée (I6)", async () => {
      const { rec } = await seedRecurrence();

      // Horizon trop court : rien à générer, l'ancre ne doit pas bouger
      const res = await (await generate(3)).json();
      expect(res.generatedCount).toBe(0);
      const untouched = await Recurrence.findById(rec._id);
      expect(untouched!.derniereGeneration).toBeUndefined();

      await generate(10);
      const updated = await Recurrence.findById(rec._id);
      expect(updated!.derniereGeneration!.getTime()).toBe(
        new Date(2026, 8, 8, 8, 0, 0).getTime()
      );
    });

    it("reprend une récurrence dormante depuis plus de 1000 intervalles", async () => {
      // 07:00 : après l'ancre (06:00) mais avant l'heure prévue (08:00) du jour
      vi.setSystemTime(new Date(2026, 8, 1, 7, 0, 0));
      const anchor = new Date(2026, 8, 1, 6, 0, 0);
      anchor.setDate(anchor.getDate() - 1500);
      const { site } = await seedRecurrence({
        frequence: "personnalisee",
        intervalleJours: 1,
        derniereGeneration: anchor,
      });

      const data = await (await generate(3)).json();
      expect(data.generatedCount).toBe(3);

      const ops = await Operation.find({ siteId: site._id }).sort({ dateHeurePrevue: 1 });
      expect(ops.map((o) => o.dateHeurePrevue.getTime())).toEqual([
        new Date(2026, 8, 1, 8, 0, 0).getTime(),
        new Date(2026, 8, 2, 8, 0, 0).getTime(),
        new Date(2026, 8, 3, 8, 0, 0).getTime(),
      ]);

      // Second passage le même jour : rien de plus n'est généré.
      const again = await (await generate(3)).json();
      expect(again.generatedCount).toBe(0);
      expect(await Operation.countDocuments({ siteId: site._id })).toBe(3);
    });

    it("crée l'occurrence en Planifiée sans ressource et signale le conflit (I7)", async () => {
      const equipe = await Equipe.create({ nom: "Équipe Conflit" });
      const vehicule = await Vehicule.create({ identification: "V-CONFLIT" });
      const { rec } = await seedRecurrence({
        equipeId: equipe._id,
        vehiculeId: vehicule._id,
      });

      // Une opération occupe déjà l'équipe sur le créneau de l'occurrence J+7
      const autreClient = await Client.create({ nom: "Autre Client" });
      const autreSite = await Site.create({ clientId: autreClient._id, nom: "Autre Site" });
      await Operation.create({
        clientId: autreClient._id,
        siteId: autreSite._id,
        natureIntervention: "Occupation du créneau",
        dateHeurePrevue: new Date(2026, 8, 8, 8, 0, 0),
        dureeEstimeeMinutes: 120,
        equipeId: equipe._id,
        statut: "Affectée",
      });

      const data = await (await generate(10)).json();
      expect(data.generatedCount).toBe(1);
      expect(data.conflits).toHaveLength(1);
      expect(data.conflits[0].recurrenceId).toBe(String(rec._id));
      expect(new Date(data.conflits[0].date).getTime()).toBe(
        new Date(2026, 8, 8, 8, 0, 0).getTime()
      );
      expect(data.conflits[0].message).toBeTruthy();

      const created = await Operation.findOne({ siteId: rec.siteId });
      expect(created!.statut).toBe("Planifiée");
      expect(created!.equipeId).toBeUndefined();
      expect(created!.vehiculeId).toBeUndefined();
    });

    it("affecte normalement l'occurrence quand il n'y a pas de conflit (I7)", async () => {
      const equipe = await Equipe.create({ nom: "Équipe Libre" });
      const vehicule = await Vehicule.create({ identification: "V-LIBRE" });
      const { rec } = await seedRecurrence({
        equipeId: equipe._id,
        vehiculeId: vehicule._id,
      });

      const data = await (await generate(10)).json();
      expect(data.generatedCount).toBe(1);
      expect(data.conflits).toHaveLength(0);

      const created = await Operation.findOne({ siteId: rec.siteId });
      expect(created!.statut).toBe("Affectée");
      expect(String(created!.equipeId)).toBe(String(equipe._id));
    });
  });
});
