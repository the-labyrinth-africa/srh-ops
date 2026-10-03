import { describe, it, expect, beforeEach } from "vitest";
import mongoose from "mongoose";
import { Operation as OperationModel } from "./operation.model";
import { OperationRepositoryMongoose } from "./operation.repository.mongoose";
import type { OperationSaisie } from "../../domain/operation";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Site } from "@/backend/clients-sites/infrastructure/mongoose/site.model";
import { Equipe } from "@/backend/equipes/infrastructure/mongoose/equipe.model";
import { Vehicule } from "@/backend/vehicules/infrastructure/mongoose/vehicule.model";
import { Equipement } from "@/backend/equipements/infrastructure/mongoose/equipement.model";
import { User } from "@/backend/comptes/infrastructure/mongoose/utilisateur.model";

const MAINTENANT = new Date("2030-10-30T08:00:00.000Z");
const j = (jour: string) => new Date(`2030-11-${jour}T10:00:00.000Z`);

describe("OperationRepositoryMongoose (contrat)", () => {
  const depot = new OperationRepositoryMongoose();
  let userId: string;
  let clientId: string;
  let siteId: string;
  let equipeId: string;
  let vehiculeId: string;
  let equipementA: string;
  let equipementB: string;

  const saisie = (surcharge: Partial<OperationSaisie> = {}): OperationSaisie => ({
    clientId,
    siteId,
    natureIntervention: "Collecte",
    dateHeurePrevue: j("01"),
    dureeEstimeeMinutes: 120,
    equipementIds: [],
    informationsParticulieres: "",
    uniteQuantite: "Litres",
    remarquesTerrain: "",
    nomSignataireClient: "",
    signatureClient: "",
    ...surcharge,
  });

  const initial = (statut: "Planifiée" | "Affectée" = "Planifiée") => ({ statut, date: MAINTENANT, parUtilisateur: userId });

  beforeEach(async () => {
    const user = await User.create({ username: "admin", nom: "Admin Ops", email: "admin@srh.ci", motDePasseHash: "x", role: "admin" });
    const client = await Client.create({ nom: "Client A", contact: { telephone: "0102", email: "a@client.ci" } });
    const site = await Site.create({ clientId: client._id, nom: "Site A", adresse: "Rue 1", typeDechets: ["Huiles"] });
    const equipe = await Equipe.create({ nom: "Équipe A", membres: ["Ali"] });
    const vehicule = await Vehicule.create({ identification: "V-001", type: "Camion", capacite: 5 });
    const pompe = await Equipement.create({ nom: "Pompe", type: "Pompage" });
    const bac = await Equipement.create({ nom: "Bac", type: "Stockage" });
    userId = String(user._id);
    clientId = String(client._id);
    siteId = String(site._id);
    equipeId = String(equipe._id);
    vehiculeId = String(vehicule._id);
    equipementA = String(pompe._id);
    equipementB = String(bac._id);
  });

  describe("creer", () => {
    it("pose le statut initial et l'historique, ignore le statut de la saisie, renvoie le niveau résumé", async () => {
      const operation = await depot.creer(
        saisie({ equipeId, vehiculeId, equipementIds: [equipementA, equipementB], statut: "Terminée" }),
        initial("Affectée")
      );

      expect(operation).toEqual({
        id: expect.stringMatching(/^[a-f\d]{24}$/),
        clientId: { id: clientId, nom: "Client A" },
        siteId: { id: siteId, nom: "Site A" },
        natureIntervention: "Collecte",
        dateHeurePrevue: j("01"),
        dureeEstimeeMinutes: 120,
        equipeId: { id: equipeId, nom: "Équipe A" },
        vehiculeId: { id: vehiculeId, identification: "V-001" },
        equipementIds: [equipementA, equipementB],
        informationsParticulieres: "",
        statut: "Affectée",
        historiqueStatuts: [{ statut: "Affectée", date: MAINTENANT, parUtilisateur: userId }],
        uniteQuantite: "Litres",
        remarquesTerrain: "",
        nomSignataireClient: "",
        signatureClient: "",
        photos: [],
        rapportPdf: "",
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        revision: 0,
      });
    });

    it("sans équipe ni véhicule : les deux relations sont absentes (pas null)", async () => {
      const operation = await depot.creer(saisie(), initial());
      expect(operation.equipeId).toBeUndefined();
      expect(operation.vehiculeId).toBeUndefined();
      expect(operation.quantiteCollectee).toBeUndefined();
    });

    it("identifiant d'équipe vide : l'erreur Mongoose remonte", async () => {
      await expect(depot.creer(saisie({ equipeId: "" }), initial())).rejects.toThrow(/Cast to ObjectId failed/);
    });
  });

  describe("trouverDetailParId", () => {
    it("peuple toutes les relations en profondeur", async () => {
      const { id } = await depot.creer(
        saisie({ equipeId, vehiculeId, equipementIds: [equipementA, equipementB] }),
        initial("Affectée")
      );

      const operation = await depot.trouverDetailParId(id);

      expect(operation).toMatchObject({
        id,
        clientId: { id: clientId, nom: "Client A", contact: { telephone: "0102", email: "a@client.ci" } },
        siteId: { id: siteId, nom: "Site A", adresse: "Rue 1", typeDechets: ["Huiles"] },
        equipeId: { id: equipeId, nom: "Équipe A", membres: ["Ali"] },
        vehiculeId: { id: vehiculeId, identification: "V-001", type: "Camion" },
        equipementIds: [
          { id: equipementA, nom: "Pompe", type: "Pompage" },
          { id: equipementB, nom: "Bac", type: "Stockage" },
        ],
        historiqueStatuts: [{ statut: "Affectée", date: MAINTENANT, parUtilisateur: { id: userId, nom: "Admin Ops" } }],
      });
    });

    it("références pendantes : null réel (jamais la chaîne « null »), équipement supprimé retiré", async () => {
      const { id } = await depot.creer(
        saisie({ equipeId, vehiculeId, equipementIds: [equipementA, equipementB] }),
        initial("Affectée")
      );
      await Client.deleteOne({ _id: clientId });
      await Equipe.deleteOne({ _id: equipeId });
      await Equipement.deleteOne({ _id: equipementA });
      await User.deleteOne({ _id: userId });

      const operation = await depot.trouverDetailParId(id);

      expect(operation?.clientId).toBeNull();
      expect(operation?.equipeId).toBeNull();
      expect(operation?.vehiculeId).toEqual({ id: vehiculeId, identification: "V-001", type: "Camion" });
      expect(operation?.equipementIds).toEqual([{ id: equipementB, nom: "Bac", type: "Stockage" }]);
      expect(operation?.historiqueStatuts[0].parUtilisateur).toBeNull();
    });

    it("null si l'opération n'existe pas", async () => {
      expect(await depot.trouverDetailParId(String(new mongoose.Types.ObjectId()))).toBeNull();
    });

    it("données de terrain, photos et entrée d'historique sans auteur", async () => {
      const { id } = await depot.creer(saisie(), initial());
      await OperationModel.updateOne(
        { _id: id },
        {
          quantiteCollectee: 12.5,
          uniteQuantite: "Kg",
          photos: [{ url: "data:image/jpeg;base64,BBBB", nom: "cuve.jpg", uploadedAt: j("02") }],
          $push: { historiqueStatuts: { statut: "En route", date: j("01"), ancienStatut: "Planifiée" } },
        }
      );

      const operation = await depot.trouverDetailParId(id);

      expect(operation?.quantiteCollectee).toBe(12.5);
      expect(operation?.uniteQuantite).toBe("Kg");
      expect(operation?.photos).toEqual([{ url: "data:image/jpeg;base64,BBBB", nom: "cuve.jpg", uploadedAt: j("02") }]);
      expect(operation?.historiqueStatuts[1]).toEqual({ statut: "En route", date: j("01"), ancienStatut: "Planifiée" });
      expect(operation?.historiqueStatuts[1]).not.toHaveProperty("parUtilisateur");
    });
  });

  describe("lister", () => {
    it("niveau liste : site avec adresse, équipements et auteur d'historique en identifiants bruts", async () => {
      await depot.creer(saisie({ equipeId, vehiculeId, equipementIds: [equipementA] }), initial("Affectée"));

      const { items, total } = await depot.lister({}, { skip: 0, limit: 20 });

      expect(total).toBe(1);
      expect(items[0]).toMatchObject({
        clientId: { id: clientId, nom: "Client A" },
        siteId: { id: siteId, nom: "Site A", adresse: "Rue 1" },
        equipeId: { id: equipeId, nom: "Équipe A" },
        vehiculeId: { id: vehiculeId, identification: "V-001" },
        equipementIds: [equipementA],
        historiqueStatuts: [{ statut: "Affectée", date: MAINTENANT, parUtilisateur: userId }],
      });
      expect(items[0].siteId).not.toHaveProperty("typeDechets");
      expect(items[0].clientId).not.toHaveProperty("contact");
    });

    it("tri par date décroissante ; pagination ; total indépendant de la pagination", async () => {
      await depot.creer(saisie({ natureIntervention: "Première", dateHeurePrevue: j("01") }), initial());
      await depot.creer(saisie({ natureIntervention: "Troisième", dateHeurePrevue: j("03") }), initial());
      await depot.creer(saisie({ natureIntervention: "Deuxième", dateHeurePrevue: j("02") }), initial());

      const tout = await depot.lister({}, { skip: 0, limit: 20 });
      expect(tout.items.map((o) => o.natureIntervention)).toEqual(["Troisième", "Deuxième", "Première"]);

      const page2 = await depot.lister({}, { skip: 1, limit: 1 });
      expect(page2.items.map((o) => o.natureIntervention)).toEqual(["Deuxième"]);
      expect(page2.total).toBe(3);
    });

    it("limite nulle, négative ou NaN : toutes les opérations (comportement historique)", async () => {
      await depot.creer(saisie({ dateHeurePrevue: j("01") }), initial());
      await depot.creer(saisie({ dateHeurePrevue: j("02") }), initial());

      for (const pagination of [
        { skip: 0, limit: 0 },
        { skip: -0, limit: -5 },
        { skip: NaN, limit: NaN },
      ]) {
        expect((await depot.lister({}, pagination)).items).toHaveLength(2);
      }
    });

    it("filtres : relations, statut, bornes de date incluses", async () => {
      const autreEquipe = await Equipe.create({ nom: "Équipe B" });
      await depot.creer(saisie({ natureIntervention: "A", equipeId, vehiculeId, dateHeurePrevue: j("01") }), initial("Affectée"));
      await depot.creer(
        saisie({ natureIntervention: "B", equipeId: String(autreEquipe._id), dateHeurePrevue: j("05") }),
        initial()
      );

      const noms = async (filtre: Parameters<typeof depot.lister>[0]) =>
        (await depot.lister(filtre, { skip: 0, limit: 20 })).items.map((o) => o.natureIntervention);

      expect(await noms({ statut: "Affectée" })).toEqual(["A"]);
      expect(await noms({ statut: "Bidon" })).toEqual([]);
      expect(await noms({ equipeId: String(autreEquipe._id) })).toEqual(["B"]);
      expect(await noms({ vehiculeId })).toEqual(["A"]);
      expect(await noms({ clientId, siteId })).toEqual(["B", "A"]);
      expect(await noms({ dateDebut: j("05") })).toEqual(["B"]);
      expect(await noms({ dateFin: j("01") })).toEqual(["A"]);
      expect(await noms({ dateDebut: j("02"), dateFin: j("04") })).toEqual([]);
    });

    it("filtre illisible : l'erreur Mongoose remonte", async () => {
      await expect(depot.lister({ clientId: "abc" }, { skip: 0, limit: 20 })).rejects.toThrow(/Cast to ObjectId failed/);
      await expect(depot.lister({ dateDebut: new Date("bidon") }, { skip: 0, limit: 20 })).rejects.toThrow(
        /Cast to date failed/
      );
    });

    it("document écrit hors Mongoose : valeurs par défaut du schéma, relations facultatives absentes", async () => {
      await OperationModel.collection.insertOne({
        clientId: new mongoose.Types.ObjectId(clientId),
        siteId: new mongoose.Types.ObjectId(siteId),
        natureIntervention: "Import",
        dateHeurePrevue: j("05"),
        statut: "Planifiée",
      });

      const { items } = await depot.lister({}, { skip: 0, limit: 20 });

      expect(items[0]).toEqual({
        id: expect.any(String),
        clientId: { id: clientId, nom: "Client A" },
        siteId: { id: siteId, nom: "Site A", adresse: "Rue 1" },
        natureIntervention: "Import",
        dateHeurePrevue: j("05"),
        dureeEstimeeMinutes: 120,
        equipementIds: [],
        informationsParticulieres: "",
        statut: "Planifiée",
        historiqueStatuts: [],
        uniteQuantite: "Litres",
        remarquesTerrain: "",
        nomSignataireClient: "",
        signatureClient: "",
        photos: [],
        rapportPdf: "",
      });
    });
  });

  describe("listerPourPlanning", () => {
    it("niveau résumé (site sans adresse), filtre appliqué", async () => {
      await depot.creer(saisie({ natureIntervention: "A", equipeId, dateHeurePrevue: j("01") }), initial());
      await depot.creer(saisie({ natureIntervention: "B", dateHeurePrevue: j("05") }), initial());

      const toutes = await depot.listerPourPlanning({});
      expect(toutes.map((o) => o.natureIntervention).sort()).toEqual(["A", "B"]);
      expect(toutes[0].siteId).toEqual({ id: siteId, nom: "Site A" });

      expect((await depot.listerPourPlanning({ equipeId })).map((o) => o.natureIntervention)).toEqual(["A"]);
      expect((await depot.listerPourPlanning({ dateDebut: j("05") })).map((o) => o.natureIntervention)).toEqual(["B"]);
    });
  });

  describe("modifier", () => {
    it("une clé absente de la saisie laisse la valeur stockée intacte (équipe, véhicule, statut, quantité)", async () => {
      const { id } = await depot.creer(saisie({ equipeId, vehiculeId }), initial("Affectée"));
      await OperationModel.updateOne({ _id: id }, { quantiteCollectee: 12 });

      const operation = await depot.modifier(id, saisie({ natureIntervention: "Modifiée" }));

      expect(operation).toMatchObject({
        id,
        natureIntervention: "Modifiée",
        statut: "Affectée",
        quantiteCollectee: 12,
        clientId: { id: clientId, nom: "Client A" },
        siteId: { id: siteId, nom: "Site A" },
        equipeId: { id: equipeId, nom: "Équipe A" },
        vehiculeId: { id: vehiculeId, identification: "V-001" },
      });
      expect(operation?.historiqueStatuts).toHaveLength(1);
    });

    it("réécrit les clés présentes, y compris le statut, sans toucher à l'historique", async () => {
      const { id } = await depot.creer(saisie({ equipementIds: [equipementA] }), initial());
      await OperationModel.updateOne({ _id: id }, { remarquesTerrain: "RAS", uniteQuantite: "Kg" });

      const operation = await depot.modifier(id, saisie({ statut: "Rapportée", dateHeurePrevue: j("09") }));

      expect(operation).toMatchObject({
        statut: "Rapportée",
        dateHeurePrevue: j("09"),
        equipementIds: [],
        remarquesTerrain: "",
        uniteQuantite: "Litres",
      });
      expect(operation?.historiqueStatuts).toHaveLength(1);
    });

    it("null si l'opération n'existe pas", async () => {
      expect(await depot.modifier(String(new mongoose.Types.ObjectId()), saisie())).toBeNull();
    });
  });

  describe("supprimer", () => {
    it("true puis false", async () => {
      const { id } = await depot.creer(saisie(), initial());
      expect(await depot.supprimer(id)).toBe(true);
      expect(await depot.supprimer(id)).toBe(false);
      expect(await OperationModel.countDocuments()).toBe(0);
    });
  });
});
