import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { GET as lister, POST as creer } from "@/app/api/operations/route";
import { GET as obtenir, PUT as modifier, DELETE as supprimer } from "@/app/api/operations/[id]/route";
import { GET as planning } from "@/app/api/operations/planning/route";
import { Operation } from "@/backend/operations/infrastructure/mongoose/operation.model";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Site } from "@/backend/clients-sites/infrastructure/mongoose/site.model";
import { Equipe } from "@/backend/equipes/infrastructure/mongoose/equipe.model";
import { Vehicule } from "@/backend/vehicules/infrastructure/mongoose/vehicule.model";
import { Equipement } from "@/backend/equipements/infrastructure/mongoose/equipement.model";
import { User } from "@/backend/comptes/infrastructure/mongoose/utilisateur.model";
import { IdentiteEntrepriseModel } from "@/backend/identite-entreprise/infrastructure/mongoose/identite-entreprise.model";
import { QUANTITE_UNITES } from "@/shared/operations/quantites";

const DATE_ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
const nouvelId = () => String(new mongoose.Types.ObjectId());
const get = (chemin: string) => new NextRequest(`http://localhost:3000${chemin}`);
const avecCorps = (chemin: string, method: string, corps: unknown) =>
  new NextRequest(`http://localhost:3000${chemin}`, { method, body: JSON.stringify(corps) });
const parametres = (id: string) => ({ params: Promise.resolve({ id }) });

describe("Caractérisation — CRUD et planning des opérations (formes exactes)", () => {
  let userId: string;
  let clientId: string;
  let siteId: string;
  let equipeId: string;
  let vehiculeId: string;
  let equipementA: string;
  let equipementB: string;

  const connecter = (role: string, rattachements: Record<string, string> = {}) =>
    vi.mocked(nextAuth.getServerSession).mockResolvedValue({
      user: { id: userId, nom: "Admin Ops", email: "admin@srh.ci", role, ...rattachements },
    } as never);

  const base = (surcharge: Record<string, unknown> = {}) => ({
    clientId,
    siteId,
    natureIntervention: "Collecte",
    dateHeurePrevue: "2030-11-01T10:00:00Z",
    ...surcharge,
  });

  const complet = (surcharge: Record<string, unknown> = {}) =>
    base({ equipeId, vehiculeId, equipementIds: [equipementA, equipementB], ...surcharge });

  const posterApi = (corps: unknown) => creer(avecCorps("/api/operations", "POST", corps));
  const poster = async (corps: Record<string, unknown>) => {
    const equipe = typeof corps.equipeId === "string" ? corps.equipeId : undefined;
    const vehicule = typeof corps.vehiculeId === "string" ? corps.vehiculeId : undefined;
    const statut = equipe && vehicule ? "Affectée" : "Planifiée";
    const dateHeurePrevue = new Date(String(corps.dateHeurePrevue));
    const uniteQuantite = QUANTITE_UNITES.find((unite) => unite === corps.uniteQuantite) ?? "Litres";
    const operation = await Operation.create({
      clientId: typeof corps.clientId === "string" ? corps.clientId : clientId,
      siteId: typeof corps.siteId === "string" ? corps.siteId : siteId,
      natureIntervention: typeof corps.natureIntervention === "string" ? corps.natureIntervention : "Collecte",
      dateHeurePrevue,
      dureeEstimeeMinutes: typeof corps.dureeEstimeeMinutes === "number" ? corps.dureeEstimeeMinutes : 120,
      equipeId: equipe,
      vehiculeId: vehicule,
      equipementIds: Array.isArray(corps.equipementIds)
        ? corps.equipementIds.filter((id): id is string => typeof id === "string")
        : [],
      informationsParticulieres: typeof corps.informationsParticulieres === "string" ? corps.informationsParticulieres : "",
      statut,
      historiqueStatuts: [{ statut, date: new Date("2030-10-30T08:00:00Z"), parUtilisateur: userId }],
      quantiteCollectee: typeof corps.quantiteCollectee === "number" ? corps.quantiteCollectee : undefined,
      uniteQuantite,
      remarquesTerrain: "",
      nomSignataireClient: "",
      signatureClient: "",
    });
    return lire(String(operation._id));
  };
  const mettre = (id: string, corps: unknown) => modifier(avecCorps(`/api/operations/${id}`, "PUT", corps), parametres(id));
  const lire = (id: string) => obtenir(get(`/api/operations/${id}`), parametres(id));

  beforeEach(async () => {
    vi.resetAllMocks();
    const user = await User.create({
      username: "admin",
      nom: "Admin Ops",
      email: "admin@srh.ci",
      motDePasseHash: "x",
      role: "admin",
    });
    userId = String(user._id);
    connecter("admin");

    const client = await Client.create({ nom: "Client A", contact: { telephone: "0102", email: "a@client.ci" } });
    const site = await Site.create({ clientId: client._id, nom: "Site A", adresse: "Rue 1", typeDechets: ["Huiles"] });
    const equipe = await Equipe.create({ nom: "Équipe A", membres: ["Ali"] });
    const vehicule = await Vehicule.create({ identification: "V-001", type: "Camion", capacite: 5 });
    const pompe = await Equipement.create({ nom: "Pompe", type: "Pompage" });
    const bac = await Equipement.create({ nom: "Bac", type: "Stockage" });
    clientId = String(client._id);
    siteId = String(site._id);
    equipeId = String(equipe._id);
    vehiculeId = String(vehicule._id);
    equipementA = String(pompe._id);
    equipementB = String(bac._id);
  });

  describe("POST /api/operations", () => {
    it("refuse la création manuelle d'une opération planifiée", async () => {
      const res = await posterApi(complet());

      expect(res.status).toBe(410);
      expect(await res.json()).toEqual({
        error: "La planification manuelle est désactivée. Enregistrez une collecte réalisée ou importez son fichier Excel.",
      });
      expect(await Operation.countDocuments()).toBe(0);
    });

    it("rôle lecture : 403, rien n'est créé", async () => {
      connecter("lecture");
      const res = await posterApi(base());
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Permission insuffisante" });
      expect(await Operation.countDocuments()).toBe(0);
    });
  });

  describe("GET /api/operations", () => {
    it("corps exact : site avec adresse, équipements et auteur d'historique non peuplés", async () => {
      const creee = await (await poster(complet())).json();

      const res = await lister(get("/api/operations"));

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        items: [
          {
            _id: creee._id,
            clientId: { _id: clientId, nom: "Client A" },
            siteId: { _id: siteId, nom: "Site A", adresse: "Rue 1" },
            equipeId: { _id: equipeId, nom: "Équipe A" },
            vehiculeId: { _id: vehiculeId, identification: "V-001" },
            equipementIds: [equipementA, equipementB],
            historiqueStatuts: [{ statut: "Affectée", parUtilisateur: userId }],
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it("tri par date prévue décroissante, pagination", async () => {
      await poster(base({ dateHeurePrevue: "2030-11-01T10:00:00Z", natureIntervention: "Première" }));
      await poster(base({ dateHeurePrevue: "2030-11-03T10:00:00Z", natureIntervention: "Troisième" }));
      await poster(base({ dateHeurePrevue: "2030-11-02T10:00:00Z", natureIntervention: "Deuxième" }));

      const tout = await (await lister(get("/api/operations"))).json();
      expect(tout.items.map((o: { natureIntervention: string }) => o.natureIntervention)).toEqual([
        "Troisième",
        "Deuxième",
        "Première",
      ]);

      const page2 = await (await lister(get("/api/operations?limit=1&page=2"))).json();
      expect(page2.items.map((o: { natureIntervention: string }) => o.natureIntervention)).toEqual(["Deuxième"]);
      expect(page2).toMatchObject({ total: 3, page: 2, limit: 1 });

      const audela = await (await lister(get("/api/operations?limit=1&page=9"))).json();
      expect(audela).toEqual({ items: [], total: 3, page: 9, limit: 1 });
    });

    it("paramètres de pagination hors norme : valeurs renvoyées telles que calculées aujourd'hui", async () => {
      await poster(base());
      await poster(base({ dateHeurePrevue: "2030-11-02T10:00:00Z" }));

      const corps = async (requete: string) => (await lister(get(`/api/operations?${requete}`))).json();

      expect(await corps("page=abc")).toMatchObject({ total: 2, page: null, limit: 20 });
      expect((await corps("page=abc")).items).toHaveLength(2);
      expect(await corps("limit=500&page=0")).toMatchObject({ total: 2, page: 1, limit: 100 });
      expect(await corps("limit=0")).toMatchObject({ total: 2, page: 1, limit: 0 });
      expect((await corps("limit=0")).items).toHaveLength(2);
      expect(await corps("limit=abc")).toMatchObject({ total: 2, page: 1, limit: null });
      expect((await corps("limit=abc")).items).toHaveLength(2);
      expect(await corps("limit=-5")).toMatchObject({ total: 2, page: 1, limit: -5 });
      expect((await corps("limit=-5")).items).toHaveLength(2);
    });

    it("filtres : statut, équipe, véhicule, site, client, bornes de date incluses", async () => {
      const autreEquipe = await Equipe.create({ nom: "Équipe B" });
      await poster(complet({ natureIntervention: "Affectée A" }));
      await poster(base({ dateHeurePrevue: "2030-11-05T10:00:00Z", natureIntervention: "Planifiée B", equipeId: String(autreEquipe._id) }));

      const noms = async (requete: string) =>
        (await (await lister(get(`/api/operations?${requete}`))).json()).items.map(
          (o: { natureIntervention: string }) => o.natureIntervention
        );

      expect(await noms("statut=Affectée")).toEqual(["Affectée A"]);
      expect(await noms("statut=Bidon")).toEqual([]);
      expect(await noms(`equipeId=${autreEquipe._id}`)).toEqual(["Planifiée B"]);
      expect(await noms(`vehiculeId=${vehiculeId}`)).toEqual(["Affectée A"]);
      expect(await noms(`siteId=${siteId}`)).toEqual(["Planifiée B", "Affectée A"]);
      expect(await noms(`clientId=${nouvelId()}`)).toEqual([]);
      expect(await noms("dateDebut=2030-11-05T10:00:00Z")).toEqual(["Planifiée B"]);
      expect(await noms("dateFin=2030-11-01T10:00:00Z")).toEqual(["Affectée A"]);
      expect(await noms("dateDebut=2030-11-01T10:00:01Z&dateFin=2030-11-05T09:59:59Z")).toEqual([]);
    });

    it("identifiant invalide rejeté par le dépôt, date illisible rejetée explicitement", async () => {
      await expect(lister(get("/api/operations?clientId=abc"))).rejects.toThrow(/Cast to ObjectId failed/);
      const response = await lister(get("/api/operations?dateDebut=bidon"));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Date de début invalide." });
    });

    it("périmètre : un compte client et un chauffeur ne voient que le leur, quels que soient les filtres envoyés", async () => {
      const autreClient = await Client.create({ nom: "Client B" });
      const autreSite = await Site.create({ clientId: autreClient._id, nom: "Site B" });
      const autreEquipe = await Equipe.create({ nom: "Équipe B" });
      await poster(complet({ natureIntervention: "A" }));
      await poster(
        base({
          clientId: String(autreClient._id),
          siteId: String(autreSite._id),
          equipeId: String(autreEquipe._id),
          natureIntervention: "B",
          dateHeurePrevue: "2030-11-07T10:00:00Z",
        })
      );

      const noms = async (requete = "") =>
        (await (await lister(get(`/api/operations${requete}`))).json()).items.map(
          (o: { natureIntervention: string }) => o.natureIntervention
        );

      connecter("client", { clientId });
      expect(await noms()).toEqual(["A"]);
      expect(await noms(`?clientId=${autreClient._id}`)).toEqual(["A"]);

      connecter("chauffeur", { equipeId: String(autreEquipe._id) });
      expect(await noms()).toEqual(["B"]);
      expect(await noms(`?equipeId=${equipeId}`)).toEqual(["B"]);
    });

    it("chauffeur sans équipe : 403, message exact", async () => {
      connecter("chauffeur");
      const res = await lister(get("/api/operations"));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Compte chauffeur sans équipe attribuée" });
    });
  });

  describe("GET /api/operations/[id]", () => {
    it("corps exact : toutes les relations peuplées en profondeur", async () => {
      const creee = await (await poster(complet())).json();

      const res = await lire(creee._id);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        ...creee,
        clientId: { _id: clientId, nom: "Client A", contact: { telephone: "0102", email: "a@client.ci" } },
        siteId: { _id: siteId, nom: "Site A", adresse: "Rue 1", typeDechets: ["Huiles"] },
        equipeId: { _id: equipeId, nom: "Équipe A", membres: ["Ali"] },
        vehiculeId: { _id: vehiculeId, identification: "V-001", type: "Camion" },
        equipementIds: [
          { _id: equipementA, nom: "Pompe", type: "Pompage" },
          { _id: equipementB, nom: "Bac", type: "Stockage" },
        ],
        historiqueStatuts: [{ statut: "Affectée", date: DATE_ISO, parUtilisateur: { _id: userId, nom: "Admin Ops" } }],
      });
    });

    it("références pendantes : null pour le client, l'équipe et l'auteur ; équipement supprimé retiré", async () => {
      const creee = await (await poster(complet())).json();
      await Client.deleteOne({ _id: clientId });
      await Equipe.deleteOne({ _id: equipeId });
      await Equipement.deleteOne({ _id: equipementA });
      await User.deleteOne({ _id: userId });

      const corps = await (await lire(creee._id)).json();

      expect(corps.clientId).toBeNull();
      expect(corps.equipeId).toBeNull();
      expect(corps.siteId).toEqual({ _id: siteId, nom: "Site A", adresse: "Rue 1", typeDechets: ["Huiles"] });
      expect(corps.equipementIds).toEqual([{ _id: equipementB, nom: "Bac", type: "Stockage" }]);
      expect(corps.historiqueStatuts).toEqual([{ statut: "Affectée", date: DATE_ISO, parUtilisateur: null }]);
    });

    it("données de terrain et photos présentes : renvoyées telles quelles", async () => {
      const creee = await (await poster(complet())).json();
      await Operation.updateOne(
        { _id: creee._id },
        {
          quantiteCollectee: 12.5,
          uniteQuantite: "Kg",
          remarquesTerrain: "RAS",
          nomSignataireClient: "M. Koné",
          signatureClient: "data:image/png;base64,AAAA",
          photos: [{ url: "data:image/jpeg;base64,BBBB", nom: "cuve.jpg", uploadedAt: new Date("2030-11-01T11:00:00Z") }],
          $push: { historiqueStatuts: { statut: "En route", date: new Date("2030-11-01T09:30:00Z"), ancienStatut: "Affectée" } },
          statut: "En route",
        }
      );

      const corps = await (await lire(creee._id)).json();

      expect(corps).toMatchObject({
        statut: "En route",
        quantiteCollectee: 12.5,
        uniteQuantite: "Kg",
        remarquesTerrain: "RAS",
        nomSignataireClient: "M. Koné",
        signatureClient: "data:image/png;base64,AAAA",
        photos: [{ url: "data:image/jpeg;base64,BBBB", nom: "cuve.jpg", uploadedAt: "2030-11-01T11:00:00.000Z" }],
      });
      expect(corps.historiqueStatuts[1]).toEqual({
        statut: "En route",
        date: "2030-11-01T09:30:00.000Z",
        ancienStatut: "Affectée",
      });
    });

    it("ordre des refus : chauffeur sans équipe (403) avant identifiant invalide (400) avant introuvable (404)", async () => {
      connecter("chauffeur");
      expect((await lire("abc")).status).toBe(403);

      connecter("admin");
      const invalide = await lire("abc");
      expect(invalide.status).toBe(400);
      expect(await invalide.json()).toEqual({ error: "Identifiant invalide" });

      const absent = await lire(nouvelId());
      expect(absent.status).toBe(404);
      expect(await absent.json()).toEqual({ error: "Non trouvé" });
    });

    it("hors périmètre (autre client, autre équipe, opération sans équipe pour un chauffeur) : 404 « Non trouvé »", async () => {
      const affectee = await (await poster(complet())).json();
      const sansEquipe = await (await poster(base({ dateHeurePrevue: "2030-11-09T10:00:00Z" }))).json();

      connecter("client", { clientId: nouvelId() });
      const autreClient = await lire(affectee._id);
      expect(autreClient.status).toBe(404);
      expect(await autreClient.json()).toEqual({ error: "Non trouvé" });

      connecter("client", { clientId });
      expect((await lire(affectee._id)).status).toBe(200);

      connecter("chauffeur", { equipeId: nouvelId() });
      expect((await lire(affectee._id)).status).toBe(404);

      connecter("chauffeur", { equipeId });
      expect((await lire(affectee._id)).status).toBe(200);
      expect((await lire(sansEquipe._id)).status).toBe(404);
    });
  });

  describe("PUT /api/operations/[id]", () => {
    it("applique l'unité globale à une quantité modifiée", async () => {
      const creee = await (await poster(complet({ quantiteCollectee: 12, uniteQuantite: "Litres" }))).json();
      await IdentiteEntrepriseModel.create({
        cle: "principale",
        nomEntreprise: "Entreprise Exemple",
        sigle: "EX",
        uniteQuantiteGlobale: "Kg",
      });

      const res = await mettre(
        creee._id,
        complet({ quantiteCollectee: 20, uniteQuantite: "Bacs", dateHeurePrevue: "2030-11-02T08:00:00Z" })
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ quantiteCollectee: 20, uniteQuantite: "Kg" });
    });

    it("corps exact ; équipe et véhicule omis sont conservés ; équipements et champs de terrain omis sont réinitialisés", async () => {
      const creee = await (await poster(complet())).json();
      await Operation.updateOne(
        { _id: creee._id },
        { quantiteCollectee: 12, uniteQuantite: "Kg", remarquesTerrain: "RAS", nomSignataireClient: "M. Koné", signatureClient: "sig" }
      );

      const res = await mettre(creee._id, base({ natureIntervention: "Modifiée", dateHeurePrevue: "2030-11-02T08:00:00Z" }));

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        _id: creee._id,
        natureIntervention: "Modifiée",
        dateHeurePrevue: "2030-11-02T08:00:00.000Z",
        equipementIds: [],
        quantiteCollectee: 12,
        uniteQuantite: "Litres",
        remarquesTerrain: "",
        nomSignataireClient: "",
        signatureClient: "",
        updatedAt: DATE_ISO,
      });
    });

    it("un statut fourni est appliqué tel quel, sans transition vérifiée ni entrée d'historique", async () => {
      const creee = await (await poster(complet())).json();

      const corps = await (await mettre(creee._id, complet({ statut: "Rapportée" }))).json();

      expect(corps.statut).toBe("Rapportée");
      expect(corps.historiqueStatuts).toHaveLength(1);
    });

    it("statut non fourni : inchangé, même si l'équipe et le véhicule sont ajoutés", async () => {
      const creee = await (await poster(base())).json();
      const corps = await (await mettre(creee._id, complet())).json();
      expect(corps.statut).toBe("Planifiée");
      expect(corps.equipeId).toEqual({ _id: equipeId, nom: "Équipe A" });
    });

    it("ordre des refus : identifiant invalide (400), corps invalide (400), conflit (409) avant introuvable (404)", async () => {
      const invalide = await mettre("abc", base());
      expect(invalide.status).toBe(400);
      expect(await invalide.json()).toEqual({ error: "Identifiant invalide" });

      expect((await mettre(nouvelId(), { natureIntervention: "" })).status).toBe(400);

      await poster(complet());
      expect((await mettre(nouvelId(), complet())).status).toBe(409);

      const absent = await mettre(nouvelId(), base());
      expect(absent.status).toBe(404);
      expect(await absent.json()).toEqual({ error: "Non trouvé" });
    });

    it("identifiant d'équipe vide : exception non interceptée", async () => {
      const creee = await (await poster(complet())).json();
      await expect(mettre(creee._id, base({ equipeId: "" }))).rejects.toThrow(/Cast to ObjectId failed/);
    });
  });

  describe("DELETE /api/operations/[id]", () => {
    it("200 { success: true }, puis 404 ; identifiant invalide 400 ; rôle lecture 403", async () => {
      const creee = await (await poster(base())).json();
      const effacer = (id: string) => supprimer(get(`/api/operations/${id}`), parametres(id));

      connecter("lecture");
      expect((await effacer(creee._id)).status).toBe(403);

      connecter("admin");
      const invalide = await effacer("abc");
      expect(invalide.status).toBe(400);

      const ok = await effacer(creee._id);
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ success: true });

      const absent = await effacer(creee._id);
      expect(absent.status).toBe(404);
      expect(await absent.json()).toEqual({ error: "Non trouvé" });
    });
  });

  describe("GET /api/operations/planning", () => {
    it("événement exact pour une opération à venir", async () => {
      const creee = await (await poster(complet({ dureeEstimeeMinutes: 90 }))).json();

      const res = await planning(get("/api/operations/planning"));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([
        {
          id: creee._id,
          title: "Client A — Collecte",
          start: "2030-11-01T10:00:00.000Z",
          end: "2030-11-01T11:30:00.000Z",
          backgroundColor: "#3949AB",
          borderColor: "#3949AB",
          extendedProps: { statut: "Affectée", site: "Site A", equipe: "Équipe A", vehicule: "V-001" },
        },
      ]);
    });

    it("statut effectif : une opération passée non terminée est Retardée, une terminée le reste", async () => {
      await Operation.create({
        clientId,
        siteId,
        natureIntervention: "En retard",
        dateHeurePrevue: new Date("2020-01-01T10:00:00Z"),
        statut: "Planifiée",
      });
      await Operation.create({
        clientId,
        siteId,
        natureIntervention: "Finie",
        dateHeurePrevue: new Date("2020-01-02T10:00:00Z"),
        statut: "Terminée",
      });

      const evenements = await (await planning(get("/api/operations/planning"))).json();
      const parTitre = Object.fromEntries(evenements.map((e: { title: string }) => [e.title, e]));

      expect(parTitre["Client A — En retard"]).toMatchObject({
        backgroundColor: "#E65100",
        borderColor: "#E65100",
        extendedProps: { statut: "Retardée", site: "Site A" },
      });
      expect(parTitre["Client A — En retard"].extendedProps).not.toHaveProperty("equipe");
      expect(parTitre["Client A — Finie"]).toMatchObject({ backgroundColor: "#2E7D32", extendedProps: { statut: "Terminée" } });
    });

    it("client supprimé : titre « Client — … » ; document écrit hors Mongoose : durée de 120 minutes ; statut inconnu : couleur de repli", async () => {
      await Client.deleteOne({ _id: clientId });
      await Operation.collection.insertOne({
        clientId: new mongoose.Types.ObjectId(clientId),
        siteId: new mongoose.Types.ObjectId(siteId),
        natureIntervention: "Import",
        dateHeurePrevue: new Date("2030-11-05T10:00:00Z"),
        statut: "Bidon",
      });

      const [evenement] = await (await planning(get("/api/operations/planning"))).json();

      expect(evenement).toEqual({
        id: expect.any(String),
        title: "Client — Import",
        start: "2030-11-05T10:00:00.000Z",
        end: "2030-11-05T12:00:00.000Z",
        backgroundColor: "text-status-planned",
        borderColor: "text-status-planned",
        extendedProps: { statut: "Bidon", site: "Site A" },
      });
    });

    it("bornes de date incluses ; périmètre client et chauffeur ; chauffeur sans équipe 403", async () => {
      const autreEquipe = await Equipe.create({ nom: "Équipe B" });
      const autreClient = await Client.create({ nom: "Client B" });
      await poster(complet());
      await poster(
        base({
          clientId: String(autreClient._id),
          equipeId: String(autreEquipe._id),
          dateHeurePrevue: "2030-11-08T10:00:00Z",
          natureIntervention: "Autre",
        })
      );

      const titres = async (requete = "") =>
        (await (await planning(get(`/api/operations/planning${requete}`))).json())
          .map((e: { title: string }) => e.title)
          .sort();

      expect(await titres()).toEqual(["Client A — Collecte", "Client B — Autre"]);
      expect(await titres("?dateDebut=2030-11-08T10:00:00Z")).toEqual(["Client B — Autre"]);
      expect(await titres("?dateFin=2030-11-01T10:00:00Z")).toEqual(["Client A — Collecte"]);

      connecter("client", { clientId });
      expect(await titres()).toEqual(["Client A — Collecte"]);

      connecter("chauffeur", { equipeId: String(autreEquipe._id) });
      expect(await titres()).toEqual(["Client B — Autre"]);

      connecter("chauffeur");
      const refus = await planning(get("/api/operations/planning"));
      expect(refus.status).toBe(403);
      expect(await refus.json()).toEqual({ error: "Compte chauffeur sans équipe attribuée" });
    });
  });
});
