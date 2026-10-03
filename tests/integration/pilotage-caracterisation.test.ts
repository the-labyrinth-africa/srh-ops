import { describe, it, expect, vi, beforeEach } from "vitest";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { GET as statistiques } from "@/app/api/dashboard/stats/route";
import { Operation } from "@/backend/operations/infrastructure/mongoose/operation.model";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Site } from "@/backend/clients-sites/infrastructure/mongoose/site.model";
import { Equipe } from "@/backend/equipes/infrastructure/mongoose/equipe.model";

const DATE_ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
const JOUR = 86_400_000;

describe("Caractérisation — statistiques du tableau de bord (formes exactes)", () => {
  let clientId: string;
  let siteId: string;
  let equipeId: string;

  const connecter = (role: string, rattachements: Record<string, string> = {}) =>
    vi.mocked(nextAuth.getServerSession).mockResolvedValue({
      user: { id: "507f1f77bcf86cd799439011", nom: "Direction", email: "dir@srh.ci", role, ...rattachements },
    } as never);

  const creer = async (natureIntervention: string, dateHeurePrevue: Date, statut: string, surcharge: Record<string, unknown> = {}) =>
    String(
      (await Operation.create({ clientId, siteId, natureIntervention, dateHeurePrevue, statut, ...surcharge }))._id
    );

  /** Un instant d'aujourd'hui (heure locale), à l'heure donnée. */
  const aujourdHui = (heures: number, minutes = 0) => {
    const date = new Date();
    date.setHours(heures, minutes, 0, 0);
    return date;
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    connecter("admin");
    const client = await Client.create({ nom: "Client A" });
    const site = await Site.create({ clientId: client._id, nom: "Site A", adresse: "Rue 1" });
    await Site.create({ clientId: client._id, nom: "Site B" });
    const equipe = await Equipe.create({ nom: "Équipe A", membres: ["Ali"] });
    clientId = String(client._id);
    siteId = String(site._id);
    equipeId = String(equipe._id);
  });

  it("base vide : compteurs à zéro, listes vides", async () => {
    await Site.deleteMany({});
    await Client.deleteMany({});

    const res = await statistiques();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      stats: { prevues: 0, enCours: 0, terminees: 0, retardees: 0, annulees: 0, totalClients: 0, totalSites: 0 },
      todayOps: [],
      delayedOps: [],
    });
  });

  it("compteurs par statut effectif ; clients et sites comptés", async () => {
    const futur = new Date(Date.now() + 5 * JOUR);
    const passe = new Date(Date.now() - 2 * JOUR);
    await creer("Planifiée à venir", futur, "Planifiée");
    await creer("Affectée à venir", futur, "Affectée");
    await creer("En route à venir", futur, "En route");
    await creer("En cours à venir", futur, "En cours");
    await creer("Retardée enregistrée, à venir", futur, "Retardée");
    await creer("Terminée", passe, "Terminée");
    await creer("Rapportée", passe, "Rapportée");
    await creer("Annulée", passe, "Annulée");
    await creer("Planifiée dépassée", passe, "Planifiée");
    await creer("En cours dépassée", passe, "En cours");

    const { stats } = await (await statistiques()).json();

    expect(stats).toEqual({
      prevues: 2,
      enCours: 2,
      terminees: 2,
      retardees: 3,
      annulees: 1,
      totalClients: 1,
      totalSites: 2,
    });
  });

  it("opérations en retard : les cinq premières dans l'ordre de la base, forme exacte", async () => {
    const passe = (jours: number) => new Date(Date.now() - jours * JOUR);
    const ids: string[] = [];
    for (let i = 1; i <= 6; i++) ids.push(await creer(`Retard ${i}`, passe(i + 1), i % 2 ? "Planifiée" : "En route"));
    await creer("Terminée ancienne", passe(9), "Terminée");

    const { delayedOps } = await (await statistiques()).json();

    expect(delayedOps).toEqual(
      ids.slice(0, 5).map((id, i) => ({
        id,
        natureIntervention: `Retard ${i + 1}`,
        dateHeurePrevue: DATE_ISO,
        statut: "Retardée",
      }))
    );
  });

  it("opérations du jour : document complet, client, site et équipe peuplés (nom seul), tri par heure", async () => {
    const tard = await creer("Fin de journée", aujourdHui(23, 30), "Terminée", { equipeId });
    const tot = await creer("Début de journée", aujourdHui(0, 30), "Terminée");
    await creer("Hier", new Date(aujourdHui(0, 0).getTime() - 1), "Terminée");
    await creer("Demain", new Date(aujourdHui(23, 59).getTime() + 60_000), "Annulée");

    const { todayOps } = await (await statistiques()).json();

    expect(todayOps).toEqual([
      {
        _id: tot,
        clientId: { _id: clientId, nom: "Client A" },
        siteId: { _id: siteId, nom: "Site A" },
        natureIntervention: "Début de journée",
        dateHeurePrevue: aujourdHui(0, 30).toISOString(),
        dureeEstimeeMinutes: 120,
        equipementIds: [],
        informationsParticulieres: "",
        statut: "Terminée",
        historiqueStatuts: [],
        uniteQuantite: "Litres",
        remarquesTerrain: "",
        nomSignataireClient: "",
        signatureClient: "",
        rapportPdf: "",
        photos: [],
        createdAt: DATE_ISO,
        updatedAt: DATE_ISO,
        __v: 0,
      },
      expect.objectContaining({
        _id: tard,
        natureIntervention: "Fin de journée",
        equipeId: { _id: equipeId, nom: "Équipe A" },
      }),
    ]);
  });

  it("opération du jour dont le client a été supprimé : relation à null", async () => {
    await creer("Orpheline", aujourdHui(12), "Terminée");
    await Client.deleteMany({});
    const { todayOps } = await (await statistiques()).json();
    expect(todayOps[0].clientId).toBeNull();
    expect(todayOps[0].siteId).toEqual({ _id: siteId, nom: "Site A" });
  });

  it("rôles : lecture 200 ; chauffeur et client 403 « Accès refusé »", async () => {
    connecter("lecture");
    expect((await statistiques()).status).toBe(200);

    for (const [role, rattachements] of [
      ["chauffeur", { equipeId }],
      ["client", { clientId }],
    ] as const) {
      connecter(role, rattachements);
      const res = await statistiques();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Accès refusé" });
    }
  });
});
