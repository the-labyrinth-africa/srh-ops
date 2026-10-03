import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { GET as lister, POST as creer } from "@/app/api/recurrences/route";
import { GET as obtenir, PUT as modifier, DELETE as supprimer } from "@/app/api/recurrences/[id]/route";
import { POST as generer } from "@/app/api/recurrences/generate/route";
import { Recurrence } from "@/backend/recurrences/infrastructure/mongoose/recurrence.model";
import { Operation } from "@/backend/operations/infrastructure/mongoose/operation.model";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Site } from "@/backend/clients-sites/infrastructure/mongoose/site.model";
import { Equipe } from "@/backend/equipes/infrastructure/mongoose/equipe.model";
import { Vehicule } from "@/backend/vehicules/infrastructure/mongoose/vehicule.model";
import { Equipement } from "@/backend/equipements/infrastructure/mongoose/equipement.model";

const DATE_ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
const USER_ID = "507f1f77bcf86cd799439011";
const nouvelId = () => String(new mongoose.Types.ObjectId());
const get = (chemin: string) => new NextRequest(`http://localhost:3000${chemin}`);
const avecCorps = (chemin: string, method: string, corps: unknown) =>
  new NextRequest(`http://localhost:3000${chemin}`, { method, body: JSON.stringify(corps) });
const parametres = (id: string) => ({ params: Promise.resolve({ id }) });

/** Demain, à l'heure locale 08:00 : seule occurrence d'une récurrence hebdomadaire sur 7 jours. */
function demainHuitHeures(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(8, 0, 0, 0);
  return date;
}

describe("Caractérisation — récurrences (formes exactes)", () => {
  let clientId: string;
  let siteId: string;
  let equipeId: string;
  let vehiculeId: string;
  let equipementA: string;
  let equipementB: string;

  const connecter = (role: string, rattachements: Record<string, string> = {}) =>
    vi.mocked(nextAuth.getServerSession).mockResolvedValue({
      user: { id: USER_ID, nom: "Admin Ops", email: "admin@srh.ci", role, ...rattachements },
    } as never);

  const base = (surcharge: Record<string, unknown> = {}) => ({
    clientId,
    siteId,
    natureIntervention: "Collecte hebdomadaire",
    frequence: "hebdomadaire",
    jourSemaine: demainHuitHeures().getDay(),
    ...surcharge,
  });

  const complet = (surcharge: Record<string, unknown> = {}) =>
    base({
      heurePrevue: "08:00",
      dureeEstimeeMinutes: 90,
      equipeId,
      vehiculeId,
      equipementIds: [equipementA, equipementB],
      informationsParticulieres: "Badge requis",
      ...surcharge,
    });

  const poster = (corps: unknown) => creer(avecCorps("/api/recurrences", "POST", corps));
  const mettre = (id: string, corps: unknown) => modifier(avecCorps(`/api/recurrences/${id}`, "PUT", corps), parametres(id));
  const lire = (id: string) => obtenir(get(`/api/recurrences/${id}`), parametres(id));
  const lancer = (corps?: unknown) =>
    generer(
      corps === undefined
        ? new NextRequest("http://localhost:3000/api/recurrences/generate", { method: "POST" })
        : avecCorps("/api/recurrences/generate", "POST", corps)
    );

  beforeEach(async () => {
    vi.resetAllMocks();
    connecter("admin");
    const client = await Client.create({ nom: "Client A" });
    const site = await Site.create({ clientId: client._id, nom: "Site A", adresse: "Rue 1" });
    const equipe = await Equipe.create({ nom: "Équipe A", membres: ["Ali"] });
    const vehicule = await Vehicule.create({ identification: "V-001", type: "Camion" });
    const pompe = await Equipement.create({ nom: "Pompe", type: "Pompage" });
    const bac = await Equipement.create({ nom: "Bac", type: "Stockage" });
    clientId = String(client._id);
    siteId = String(site._id);
    equipeId = String(equipe._id);
    vehiculeId = String(vehicule._id);
    equipementA = String(pompe._id);
    equipementB = String(bac._id);
  });

  describe("POST /api/recurrences", () => {
    it("récurrence complète : 201, corps exact, relations peuplées", async () => {
      const res = await poster(complet());

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({
        _id: expect.stringMatching(/^[a-f\d]{24}$/),
        clientId: { _id: clientId, nom: "Client A" },
        siteId: { _id: siteId, nom: "Site A", adresse: "Rue 1" },
        natureIntervention: "Collecte hebdomadaire",
        frequence: "hebdomadaire",
        jourSemaine: demainHuitHeures().getDay(),
        heurePrevue: "08:00",
        dureeEstimeeMinutes: 90,
        equipeId: { _id: equipeId, nom: "Équipe A" },
        vehiculeId: { _id: vehiculeId, identification: "V-001" },
        equipementIds: [
          { _id: equipementA, nom: "Pompe" },
          { _id: equipementB, nom: "Bac" },
        ],
        informationsParticulieres: "Badge requis",
        active: true,
        createdAt: DATE_ISO,
        updatedAt: DATE_ISO,
        __v: 0,
      });
    });

    it("récurrence minimale : valeurs par défaut, clés facultatives absentes", async () => {
      const corps = await (await poster({ clientId, siteId, natureIntervention: "Passage", frequence: "mensuelle" })).json();

      expect(corps).toMatchObject({
        heurePrevue: "08:00",
        dureeEstimeeMinutes: 120,
        equipementIds: [],
        informationsParticulieres: "",
        active: true,
      });
      for (const cle of ["jourSemaine", "jourMois", "intervalleJours", "equipeId", "vehiculeId", "derniereGeneration"]) {
        expect(corps, cle).not.toHaveProperty(cle);
      }
    });

    it("corps invalide : 400 avec le détail Zod exact", async () => {
      const res = await poster({ natureIntervention: "", frequence: "quotidienne", heurePrevue: "25:00" });

      expect(res.status).toBe(400);
      const { error } = await res.json();
      expect(error.formErrors).toEqual([]);
      expect(Object.keys(error.fieldErrors).sort()).toEqual([
        "clientId",
        "frequence",
        "heurePrevue",
        "natureIntervention",
        "siteId",
      ]);
      expect(error.fieldErrors.natureIntervention).toEqual(["Nature requise"]);
      expect(error.fieldErrors.heurePrevue).toEqual(["Heure invalide (HH:mm)"]);
    });

    it("rôles : lecture ne peut pas écrire (403), chauffeur et client n'ont aucun accès (403)", async () => {
      connecter("lecture");
      const lecture = await poster(base());
      expect(lecture.status).toBe(403);
      expect(await lecture.json()).toEqual({ error: "Permission insuffisante" });

      for (const [role, rattachements] of [
        ["chauffeur", { equipeId }],
        ["client", { clientId }],
      ] as const) {
        connecter(role, rattachements);
        const res = await lister(get("/api/recurrences"));
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: "Accès refusé" });
      }
      expect(await Recurrence.countDocuments()).toBe(0);
    });
  });

  describe("GET /api/recurrences", () => {
    it("corps exact `{ items }`, tri par création décroissante", async () => {
      const premiere = await (await poster(complet({ natureIntervention: "Première" }))).json();
      await new Promise((resolve) => setTimeout(resolve, 5));
      const seconde = await (await poster(base({ natureIntervention: "Seconde" }))).json();

      const res = await lister(get("/api/recurrences"));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ items: [seconde, premiere] });
    });

    it("filtres : client, site, fréquence, active (toute valeur autre que « true » vaut faux)", async () => {
      const autreClient = await Client.create({ nom: "Client B" });
      const autreSite = await Site.create({ clientId: autreClient._id, nom: "Site B" });
      await poster(base({ natureIntervention: "A hebdo" }));
      await poster(
        base({
          natureIntervention: "B mensuelle inactive",
          clientId: String(autreClient._id),
          siteId: String(autreSite._id),
          frequence: "mensuelle",
          jourMois: 5,
          active: false,
        })
      );

      const noms = async (requete: string) =>
        (await (await lister(get(`/api/recurrences?${requete}`))).json()).items
          .map((r: { natureIntervention: string }) => r.natureIntervention)
          .sort();

      expect(await noms(`clientId=${clientId}`)).toEqual(["A hebdo"]);
      expect(await noms(`siteId=${autreSite._id}`)).toEqual(["B mensuelle inactive"]);
      expect(await noms("frequence=mensuelle")).toEqual(["B mensuelle inactive"]);
      expect(await noms("frequence=bidon")).toEqual([]);
      expect(await noms("active=true")).toEqual(["A hebdo"]);
      expect(await noms("active=false")).toEqual(["B mensuelle inactive"]);
      expect(await noms("active=oui")).toEqual(["B mensuelle inactive"]);
      expect(await noms("active=")).toEqual(["A hebdo", "B mensuelle inactive"]);
    });

    it("filtre d'identifiant illisible : exception non interceptée", async () => {
      await expect(lister(get("/api/recurrences?clientId=abc"))).rejects.toThrow(/Cast to ObjectId failed/);
    });
  });

  describe("GET /api/recurrences/[id]", () => {
    it("même corps que la création ; identifiant invalide 400 ; introuvable 404 avec le message exact", async () => {
      const creee = await (await poster(complet())).json();

      const res = await lire(creee._id);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(creee);

      const invalide = await lire("abc");
      expect(invalide.status).toBe(400);
      expect(await invalide.json()).toEqual({ error: "Identifiant invalide" });

      const absente = await lire(nouvelId());
      expect(absente.status).toBe(404);
      expect(await absente.json()).toEqual({ error: "Récurrence non trouvée" });
    });

    it("références pendantes : null pour le client et l'équipe, équipement supprimé retiré", async () => {
      const creee = await (await poster(complet())).json();
      await Client.deleteOne({ _id: clientId });
      await Equipe.deleteOne({ _id: equipeId });
      await Equipement.deleteOne({ _id: equipementA });

      const corps = await (await lire(creee._id)).json();

      expect(corps.clientId).toBeNull();
      expect(corps.equipeId).toBeNull();
      expect(corps.siteId).toEqual({ _id: siteId, nom: "Site A", adresse: "Rue 1" });
      expect(corps.equipementIds).toEqual([{ _id: equipementB, nom: "Bac" }]);
    });
  });

  describe("PUT /api/recurrences/[id]", () => {
    it("corps exact ; les clés omises à défaut Zod sont réécrites (réactivation comprise), les autres conservées", async () => {
      const creee = await (await poster(complet({ active: false }))).json();

      const res = await mettre(creee._id, {
        clientId,
        siteId,
        natureIntervention: "Modifiée",
        frequence: "mensuelle",
        jourMois: 12,
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        ...creee,
        natureIntervention: "Modifiée",
        frequence: "mensuelle",
        jourMois: 12,
        dureeEstimeeMinutes: 120,
        equipementIds: [],
        informationsParticulieres: "",
        active: true,
        updatedAt: DATE_ISO,
      });
    });

    it("identifiant invalide 400 ; corps invalide 400 ; introuvable 404", async () => {
      expect((await mettre("abc", base())).status).toBe(400);
      expect((await mettre(nouvelId(), { natureIntervention: "" })).status).toBe(400);
      const absente = await mettre(nouvelId(), base());
      expect(absente.status).toBe(404);
      expect(await absente.json()).toEqual({ error: "Récurrence non trouvée" });
    });
  });

  describe("DELETE /api/recurrences/[id]", () => {
    it("message exact, puis 404 ; identifiant invalide 400 ; rôle lecture 403", async () => {
      const creee = await (await poster(base())).json();
      const effacer = (id: string) => supprimer(get(`/api/recurrences/${id}`), parametres(id));

      connecter("lecture");
      expect((await effacer(creee._id)).status).toBe(403);

      connecter("admin");
      expect((await effacer("abc")).status).toBe(400);

      const ok = await effacer(creee._id);
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ message: "Récurrence supprimée avec succès" });

      const absente = await effacer(creee._id);
      expect(absente.status).toBe(404);
      expect(await absente.json()).toEqual({ error: "Récurrence non trouvée" });
    });
  });

  describe("POST /api/recurrences/generate", () => {
    it("réponse exacte ; opération créée avec ses ressources, son historique et les valeurs par défaut du schéma", async () => {
      const recurrence = await (await poster(complet())).json();

      const res = await lancer({ horizonDays: 7 });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        message: "1 opération(s) récurrente(s) générée(s) avec succès.",
        generatedCount: 1,
        horizonDays: 7,
        conflits: [],
      });

      const operations = JSON.parse(JSON.stringify(await Operation.find().lean()));
      expect(operations).toEqual([
        {
          _id: expect.any(String),
          clientId,
          siteId,
          natureIntervention: "Collecte hebdomadaire",
          dateHeurePrevue: demainHuitHeures().toISOString(),
          dureeEstimeeMinutes: 90,
          equipeId,
          vehiculeId,
          equipementIds: [equipementA, equipementB],
          informationsParticulieres: "Badge requis",
          statut: "Affectée",
          historiqueStatuts: [{ statut: "Affectée", date: DATE_ISO, parUtilisateur: USER_ID }],
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
      ]);

      const apres = JSON.parse(JSON.stringify(await Recurrence.findById(recurrence._id).lean()));
      expect(apres.derniereGeneration).toBe(demainHuitHeures().toISOString());
    });

    it("relance : aucune opération en double, message à zéro, ancre inchangée", async () => {
      const recurrence = await (await poster(base())).json();
      await lancer({ horizonDays: 7 });

      const res = await lancer({ horizonDays: 7 });

      expect(await res.json()).toEqual({
        message: "0 opération(s) récurrente(s) générée(s) avec succès.",
        generatedCount: 0,
        horizonDays: 7,
        conflits: [],
      });
      expect(await Operation.countDocuments()).toBe(1);
      const apres = JSON.parse(JSON.stringify(await Recurrence.findById(recurrence._id).lean()));
      expect(apres.derniereGeneration).toBe(demainHuitHeures().toISOString());
    });

    it("sans ressources : opération Planifiée, sans équipe ni véhicule", async () => {
      await poster(base());
      await lancer({ horizonDays: 7 });
      const [operation] = JSON.parse(JSON.stringify(await Operation.find().lean()));
      expect(operation.statut).toBe("Planifiée");
      expect(operation).not.toHaveProperty("equipeId");
      expect(operation).not.toHaveProperty("vehiculeId");
      expect(operation.dureeEstimeeMinutes).toBe(120);
    });

    it("équipe et véhicule déjà pris : opération créée sans ressource, conflit signalé avec les deux messages joints", async () => {
      const recurrence = await (await poster(complet())).json();
      await Operation.create({
        clientId,
        siteId: new mongoose.Types.ObjectId(),
        natureIntervention: "Occupe les ressources",
        dateHeurePrevue: demainHuitHeures(),
        dureeEstimeeMinutes: 60,
        equipeId,
        vehiculeId,
        statut: "Affectée",
      });

      const corps = await (await lancer({ horizonDays: 7 })).json();

      expect(corps).toEqual({
        message: "1 opération(s) récurrente(s) générée(s) avec succès.",
        generatedCount: 1,
        horizonDays: 7,
        conflits: [
          {
            recurrenceId: recurrence._id,
            date: demainHuitHeures().toISOString(),
            message:
              "L'équipe est déjà affectée à une opération sur ce créneau ; Le véhicule est déjà affecté à une opération sur ce créneau",
          },
        ],
      });
      const generee = JSON.parse(
        JSON.stringify(await Operation.findOne({ natureIntervention: "Collecte hebdomadaire" }).lean())
      );
      expect(generee.statut).toBe("Planifiée");
      expect(generee).not.toHaveProperty("equipeId");
      expect(generee).not.toHaveProperty("vehiculeId");
    });

    it("récurrence inactive : ignorée", async () => {
      await poster(base({ active: false }));
      const corps = await (await lancer({ horizonDays: 7 })).json();
      expect(corps.generatedCount).toBe(0);
      expect(await Operation.countDocuments()).toBe(0);
    });

    it("horizon : 30 jours par défaut (corps absent, illisible ou à zéro), borné entre 1 et 90", async () => {
      const horizon = async (corps?: unknown) => (await (await lancer(corps)).json()).horizonDays;

      expect(await horizon()).toBe(30);
      expect(await horizon({})).toBe(30);
      expect(await horizon({ horizonDays: 0 })).toBe(30);
      expect(await horizon({ horizonDays: 500 })).toBe(90);
      expect(await horizon({ horizonDays: -5 })).toBe(1);
      expect(await horizon({ horizonDays: 12 })).toBe(12);

      const illisible = await generer(
        new NextRequest("http://localhost:3000/api/recurrences/generate", { method: "POST", body: "{pas du json" })
      );
      expect((await illisible.json()).horizonDays).toBe(30);
    });

    it("horizon non numérique : renvoyé `null`, rien n'est généré", async () => {
      await poster(base());
      const corps = await (await lancer({ horizonDays: "abc" })).json();
      expect(corps).toEqual({
        message: "0 opération(s) récurrente(s) générée(s) avec succès.",
        generatedCount: 0,
        horizonDays: null,
        conflits: [],
      });
    });

    it("rôles : lecture et chauffeur 403 « Permission insuffisante » (le droit d'écriture est contrôlé en premier)", async () => {
      connecter("lecture");
      const lecture = await lancer({});
      expect(lecture.status).toBe(403);
      expect(await lecture.json()).toEqual({ error: "Permission insuffisante" });

      connecter("chauffeur", { equipeId });
      const chauffeur = await lancer({});
      expect(chauffeur.status).toBe(403);
      expect(await chauffeur.json()).toEqual({ error: "Permission insuffisante" });
    });
  });
});
