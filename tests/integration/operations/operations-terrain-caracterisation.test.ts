import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { PATCH as changerStatut } from "@/app/api/operations/[id]/statut/route";
import { POST as ajouterPhoto, DELETE as retirerPhoto } from "@/app/api/operations/[id]/photos/route";
import { Operation } from "@/backend/operations/infrastructure/mongoose/operation.model";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Site } from "@/backend/clients-sites/infrastructure/mongoose/site.model";
import { Equipe } from "@/backend/equipes/infrastructure/mongoose/equipe.model";
import { Vehicule } from "@/backend/vehicules/infrastructure/mongoose/vehicule.model";
import { Equipement } from "@/backend/equipements/infrastructure/mongoose/equipement.model";
import { User } from "@/backend/comptes/infrastructure/mongoose/utilisateur.model";

/** Document relu directement en base (le modèle n'est pas typé à la lecture). */
interface DocumentLu {
  statut: string;
  remarquesTerrain: string;
  __v: number;
  photos: { url: string; nom: string }[];
  historiqueStatuts: unknown[];
}
const lireEnBase = async (id: string) => (await Operation.findById(id).lean()) as unknown as DocumentLu;

const DATE_ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
const PHOTO = "data:image/jpeg;base64,AAAA";
const nouvelId = () => String(new mongoose.Types.ObjectId());
const parametres = (id: string) => ({ params: Promise.resolve({ id }) });
const requete = (chemin: string, method: string, corps: unknown) =>
  new NextRequest(`http://localhost:3000${chemin}`, { method, body: JSON.stringify(corps) });

describe("Caractérisation — statut, données de terrain et photos (formes exactes)", () => {
  let userId: string;
  let clientId: string;
  let siteId: string;
  let equipeId: string;
  let vehiculeId: string;
  let equipementId: string;

  const connecter = (role: string, rattachements: Record<string, string> = {}) =>
    vi.mocked(nextAuth.getServerSession).mockResolvedValue({
      user: { id: userId, nom: "Admin Ops", email: "admin@srh.ci", role, ...rattachements },
    } as never);

  const creer = async (surcharge: Record<string, unknown> = {}) => {
    const operation = await Operation.create({
      clientId,
      siteId,
      natureIntervention: "Collecte",
      dateHeurePrevue: new Date("2030-11-01T10:00:00Z"),
      equipeId,
      vehiculeId,
      equipementIds: [equipementId],
      statut: "Affectée",
      ...surcharge,
    });
    return String(operation._id);
  };

  const patch = (id: string, corps: unknown) =>
    changerStatut(requete(`/api/operations/${id}/statut`, "PATCH", corps), parametres(id));
  const poster = (id: string, corps: unknown) =>
    ajouterPhoto(requete(`/api/operations/${id}/photos`, "POST", corps), parametres(id));
  const effacer = (id: string, corps: unknown) =>
    retirerPhoto(requete(`/api/operations/${id}/photos`, "DELETE", corps), parametres(id));

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
    clientId = String(client._id);
    siteId = String(site._id);
    equipeId = String(equipe._id);
    vehiculeId = String(vehicule._id);
    equipementId = String(pompe._id);
  });

  describe("PATCH /api/operations/[id]/statut", () => {
    it("corps exact : relations peuplées (site avec adresse, équipements avec nom), historique complété", async () => {
      const id = await creer();

      const res = await patch(id, { statut: "En route" });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        _id: id,
        clientId: { _id: clientId, nom: "Client A" },
        siteId: { _id: siteId, nom: "Site A", adresse: "Rue 1" },
        natureIntervention: "Collecte",
        dateHeurePrevue: "2030-11-01T10:00:00.000Z",
        dureeEstimeeMinutes: 120,
        equipeId: { _id: equipeId, nom: "Équipe A" },
        vehiculeId: { _id: vehiculeId, identification: "V-001" },
        equipementIds: [{ _id: equipementId, nom: "Pompe" }],
        informationsParticulieres: "",
        statut: "En route",
        historiqueStatuts: [{ statut: "En route", date: DATE_ISO, parUtilisateur: userId, ancienStatut: "Affectée" }],
        uniteQuantite: "Litres",
        remarquesTerrain: "",
        nomSignataireClient: "",
        signatureClient: "",
        rapportPdf: "",
        photos: [],
        createdAt: DATE_ISO,
        updatedAt: DATE_ISO,
        // Chaque enregistrement qui touche un tableau (ici l'historique) incrémente la révision.
        __v: 1,
      });
    });

    it("données de terrain fournies : appliquées ; les photos fournies remplacent toutes les photos existantes", async () => {
      const id = await creer({
        statut: "En cours",
        photos: [{ url: "data:image/jpeg;base64,ANCIENNE", nom: "ancienne.jpg" }],
      });

      const corps = await (
        await patch(id, {
          statut: "Terminée",
          quantiteCollectee: 12.5,
          uniteQuantite: "Kg",
          remarquesTerrain: "RAS",
          nomSignataireClient: "M. Koné",
          signatureClient: "data:image/png;base64,SIGN",
          photos: [{ url: "data:image/jpeg;base64,BBBB", nom: "cuve.jpg" }, { url: "data:image/jpeg;base64,CCCC" }],
        })
      ).json();

      expect(corps).toMatchObject({
        statut: "Terminée",
        quantiteCollectee: 12.5,
        uniteQuantite: "Kg",
        remarquesTerrain: "RAS",
        nomSignataireClient: "M. Koné",
        signatureClient: "data:image/png;base64,SIGN",
      });
      expect(corps.photos).toEqual([
        { url: "data:image/jpeg;base64,BBBB", nom: "cuve.jpg", uploadedAt: DATE_ISO },
        { url: "data:image/jpeg;base64,CCCC", nom: "", uploadedAt: DATE_ISO },
      ]);
      expect(corps.__v).toBe(1);
    });

    it("données de terrain omises : conservées ; chaîne vide ou tableau vide fournis : appliqués", async () => {
      const id = await creer({
        statut: "Terminée",
        quantiteCollectee: 12.5,
        uniteQuantite: "Kg",
        remarquesTerrain: "RAS",
        nomSignataireClient: "M. Koné",
        signatureClient: "sig",
        photos: [{ url: PHOTO, nom: "cuve.jpg" }],
      });

      const conserve = await (await patch(id, { statut: "Rapportée" })).json();
      expect(conserve).toMatchObject({
        statut: "Rapportée",
        quantiteCollectee: 12.5,
        uniteQuantite: "Kg",
        remarquesTerrain: "RAS",
        nomSignataireClient: "M. Koné",
        signatureClient: "sig",
      });
      expect(conserve.photos).toHaveLength(1);

      const vide = await (
        await patch(id, { statut: "Rapportée", remarquesTerrain: "", nomSignataireClient: "", signatureClient: "", photos: [] })
      ).json();
      expect(vide).toMatchObject({ remarquesTerrain: "", nomSignataireClient: "", signatureClient: "", photos: [] });
      expect(vide.quantiteCollectee).toBe(12.5);
      expect(vide.uniteQuantite).toBe("Kg");
    });

    it("même statut : accepté, une entrée d'historique est ajoutée avec l'ancien statut identique", async () => {
      const id = await creer({ statut: "Planifiée" });

      const res = await patch(id, { statut: "Planifiée" });

      expect(res.status).toBe(200);
      expect((await res.json()).historiqueStatuts).toEqual([
        { statut: "Planifiée", date: DATE_ISO, parUtilisateur: userId, ancienStatut: "Planifiée" },
      ]);
    });

    it("transition interdite : 400 avec le message exact, rien n'est modifié", async () => {
      const id = await creer({ statut: "Planifiée" });

      const res = await patch(id, { statut: "Terminée", remarquesTerrain: "ne doit pas être écrit" });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Transition Planifiée → Terminée non autorisée" });
      const enBase = await lireEnBase(id);
      expect(enBase).toMatchObject({ statut: "Planifiée", remarquesTerrain: "", historiqueStatuts: [] });
    });

    it("Terminée sans être passée par En cours : acceptée, alerte de cohérence journalisée", async () => {
      const alerte = vi.spyOn(console, "warn").mockImplementation(() => {});
      const retardee = await creer({ statut: "Retardée" });
      const enCours = await creer({ statut: "En cours", dateHeurePrevue: new Date("2030-11-05T10:00:00Z") });

      expect((await patch(retardee, { statut: "Terminée" })).status).toBe(200);
      expect(alerte).toHaveBeenCalledTimes(1);
      expect(alerte).toHaveBeenCalledWith(
        `[cohérence] Opération ${retardee} passée Terminée sans En cours (était Retardée)`
      );

      expect((await patch(enCours, { statut: "Terminée" })).status).toBe(200);
      expect(alerte).toHaveBeenCalledTimes(1);
      alerte.mockRestore();
    });

    it("corps invalide : 400 avec le détail Zod", async () => {
      const id = await creer();

      const inconnu = await patch(id, { statut: "Bidon" });
      expect(inconnu.status).toBe(400);
      expect((await inconnu.json()).error.fieldErrors).toHaveProperty("statut");

      const quantite = await patch(id, { statut: "En route", quantiteCollectee: 0 });
      expect(quantite.status).toBe(400);
      expect((await quantite.json()).error.fieldErrors).toEqual({ quantiteCollectee: ["Quantité collectée invalide"] });

      expect((await patch(id, {})).status).toBe(400);
    });

    it("ordre des refus : rôle (403), chauffeur sans équipe (403), identifiant (400), corps (400), introuvable (404), équipe (403), transition (400)", async () => {
      const id = await creer({ statut: "Planifiée" });

      connecter("lecture");
      const lecture = await patch(id, { statut: "Affectée" });
      expect(lecture.status).toBe(403);
      expect(await lecture.json()).toEqual({ error: "Permission insuffisante" });

      connecter("client", { clientId });
      expect((await patch(id, { statut: "Affectée" })).status).toBe(403);

      connecter("chauffeur");
      const sansEquipe = await patch("abc", { statut: "Affectée" });
      expect(sansEquipe.status).toBe(403);
      expect(await sansEquipe.json()).toEqual({ error: "Compte chauffeur sans équipe attribuée" });

      connecter("admin");
      const invalide = await patch("abc", {});
      expect(invalide.status).toBe(400);
      expect(await invalide.json()).toEqual({ error: "Identifiant invalide" });

      expect((await patch(nouvelId(), {})).status).toBe(400);

      const absent = await patch(nouvelId(), { statut: "Affectée" });
      expect(absent.status).toBe(404);
      expect(await absent.json()).toEqual({ error: "Non trouvé" });

      connecter("chauffeur", { equipeId: nouvelId() });
      expect((await patch(nouvelId(), { statut: "Affectée" })).status).toBe(404);
      const autreEquipe = await patch(id, { statut: "Terminée" });
      expect(autreEquipe.status).toBe(403);
      expect(await autreEquipe.json()).toEqual({ error: "Opération non affectée à votre équipe" });

      connecter("chauffeur", { equipeId });
      expect((await patch(id, { statut: "Terminée" })).status).toBe(400);
      expect((await patch(id, { statut: "Affectée" })).status).toBe(200);
      expect((await lireEnBase(id)).historiqueStatuts).toHaveLength(1);
    });

    it("opération sans équipe : aucun chauffeur ne peut agir, le personnel oui", async () => {
      const id = await creer({ equipeId: undefined, statut: "Planifiée" });

      connecter("chauffeur", { equipeId });
      expect((await patch(id, { statut: "Annulée" })).status).toBe(403);

      connecter("dispatcher");
      expect((await patch(id, { statut: "Annulée" })).status).toBe(200);
    });
  });

  describe("POST /api/operations/[id]/photos", () => {
    it("201, corps exact ; la photo est ajoutée à la suite, sans toucher au reste", async () => {
      const id = await creer({ photos: [{ url: "data:image/jpeg;base64,PREMIERE", nom: "a.jpg" }] });

      const res = await poster(id, { photo: PHOTO, nom: "cuve.jpg" });

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ photo: { url: PHOTO, nom: "cuve.jpg", uploadedAt: DATE_ISO } });
      const enBase = await lireEnBase(id);
      expect(enBase.photos.map((p) => p.nom)).toEqual(["a.jpg", "cuve.jpg"]);
      expect(enBase.statut).toBe("Affectée");
      expect(enBase.__v).toBe(1);
    });

    it("nom absent ou vide : « photo-<horodatage>.jpg »", async () => {
      const id = await creer();
      const sansNom = await (await poster(id, { photo: PHOTO })).json();
      expect(sansNom.photo.nom).toMatch(/^photo-\d{13}\.jpg$/);
      const nomVide = await (await poster(id, { photo: PHOTO, nom: "" })).json();
      expect(nomVide.photo.nom).toMatch(/^photo-\d{13}\.jpg$/);
    });

    it("forme de la photo : contrôlée avant de chercher l'opération, messages exacts", async () => {
      const absente = nouvelId();

      const manquante = await poster(absente, {});
      expect(manquante.status).toBe(400);
      expect(await manquante.json()).toEqual({ error: "Photo requise (base64 data URL)" });

      const nonChaine = await poster(absente, { photo: 42 });
      expect(nonChaine.status).toBe(400);
      expect(await nonChaine.json()).toEqual({ error: "Photo requise (base64 data URL)" });

      const format = await poster(absente, { photo: "https://exemple.ci/photo.jpg" });
      expect(format.status).toBe(400);
      expect(await format.json()).toEqual({ error: "Format de photo invalide" });

      const lourde = await poster(absente, { photo: `data:image/jpeg;base64,${"A".repeat(2 * 1024 * 1024)}` });
      expect(lourde.status).toBe(413);
      expect(await lourde.json()).toEqual({ error: "La photo dépasse 2 Mo. Réduisez sa taille avant l'envoi." });

      const juste = await poster(absente, { photo: "data:image/jpeg;base64,".padEnd(2 * 1024 * 1024, "A") });
      expect(juste.status).toBe(404);
    });

    it("dix photos : la onzième est refusée (400), avant le contrôle du poids cumulé", async () => {
      const id = await creer({
        photos: Array.from({ length: 10 }, (_, i) => ({ url: `${PHOTO}${i}`, nom: `p${i}.jpg` })),
      });

      const res = await poster(id, { photo: PHOTO });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Maximum de 10 photos atteint" });
      expect((await lireEnBase(id)).photos).toHaveLength(10);
    });

    it("poids cumulé : 8 Mo exactement acceptés, un octet de plus refusé (413)", async () => {
      const mega = (octets: number) => "data:image/jpeg;base64,".padEnd(octets, "A");
      const id = await creer({
        photos: [1, 2, 3].map((n) => ({ url: mega(2 * 1024 * 1024), nom: `p${n}.jpg` })),
      });

      const trop = await poster(id, { photo: mega(2 * 1024 * 1024) });
      expect(trop.status).toBe(201);

      const depasse = await poster(id, { photo: PHOTO });
      expect(depasse.status).toBe(413);
      expect(await depasse.json()).toEqual({ error: "Les photos de cette opération dépassent 8 Mo au total." });
    });

    it("ordre des refus : rôle (403), chauffeur sans équipe (403), identifiant (400), introuvable (404), équipe (403)", async () => {
      const id = await creer();

      connecter("lecture");
      const lecture = await poster(id, { photo: PHOTO });
      expect(lecture.status).toBe(403);
      expect(await lecture.json()).toEqual({ error: "Permission insuffisante" });

      connecter("chauffeur");
      const sansEquipe = await poster("abc", { photo: PHOTO });
      expect(sansEquipe.status).toBe(403);
      expect(await sansEquipe.json()).toEqual({ error: "Compte chauffeur sans équipe attribuée" });

      connecter("admin");
      const invalide = await poster("abc", {});
      expect(invalide.status).toBe(400);
      expect(await invalide.json()).toEqual({ error: "Identifiant invalide" });

      const absent = await poster(nouvelId(), { photo: PHOTO });
      expect(absent.status).toBe(404);
      expect(await absent.json()).toEqual({ error: "Non trouvé" });

      connecter("chauffeur", { equipeId: nouvelId() });
      const autreEquipe = await poster(id, { photo: PHOTO });
      expect(autreEquipe.status).toBe(403);
      expect(await autreEquipe.json()).toEqual({ error: "Opération non affectée à votre équipe" });

      connecter("chauffeur", { equipeId });
      expect((await poster(id, { photo: PHOTO })).status).toBe(201);
    });
  });

  describe("DELETE /api/operations/[id]/photos", () => {
    it("retire toutes les photos portant cette URL ; URL inconnue : succès sans effet", async () => {
      const id = await creer({
        photos: [
          { url: `${PHOTO}1`, nom: "a.jpg" },
          { url: `${PHOTO}2`, nom: "b.jpg" },
          { url: `${PHOTO}1`, nom: "c.jpg" },
        ],
      });

      const inconnue = await effacer(id, { url: "data:image/jpeg;base64,INCONNUE" });
      expect(inconnue.status).toBe(200);
      expect(await inconnue.json()).toEqual({ success: true });
      expect(await lireEnBase(id)).toMatchObject({ __v: 0 });
      expect((await lireEnBase(id)).photos).toHaveLength(3);

      const res = await effacer(id, { url: `${PHOTO}1` });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      const enBase = await lireEnBase(id);
      expect(enBase.photos.map((p) => p.nom)).toEqual(["b.jpg"]);
      expect(enBase.__v).toBe(1);
    });

    it("ordre des refus : rôle (403), chauffeur sans équipe (403), identifiant (400), URL absente (400), introuvable (404), équipe (403)", async () => {
      const id = await creer({ photos: [{ url: PHOTO, nom: "a.jpg" }] });

      connecter("client", { clientId });
      expect((await effacer(id, { url: PHOTO })).status).toBe(403);

      connecter("chauffeur");
      expect((await effacer("abc", { url: PHOTO })).status).toBe(403);

      connecter("admin");
      expect((await effacer("abc", {})).status).toBe(400);

      const sansUrl = await effacer(nouvelId(), {});
      expect(sansUrl.status).toBe(400);
      expect(await sansUrl.json()).toEqual({ error: "URL de la photo requise" });

      const absent = await effacer(nouvelId(), { url: PHOTO });
      expect(absent.status).toBe(404);
      expect(await absent.json()).toEqual({ error: "Non trouvé" });

      connecter("chauffeur", { equipeId: nouvelId() });
      const autreEquipe = await effacer(id, { url: PHOTO });
      expect(autreEquipe.status).toBe(403);
      expect(await autreEquipe.json()).toEqual({ error: "Opération non affectée à votre équipe" });
      expect((await lireEnBase(id)).photos).toHaveLength(1);

      connecter("chauffeur", { equipeId });
      expect((await effacer(id, { url: PHOTO })).status).toBe(200);
      expect((await lireEnBase(id)).photos).toHaveLength(0);
    });
  });
});
