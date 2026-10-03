import { describe, it, expect, beforeEach } from "vitest";
import mongoose from "mongoose";
import { Recurrence as RecurrenceModel } from "./recurrence.model";
import { RecurrenceRepositoryMongoose } from "./recurrence.repository.mongoose";
import type { RecurrenceSaisie } from "../../domain/recurrence";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Site } from "@/backend/clients-sites/infrastructure/mongoose/site.model";
import { Equipe } from "@/backend/equipes/infrastructure/mongoose/equipe.model";
import { Vehicule } from "@/backend/vehicules/infrastructure/mongoose/vehicule.model";
import { Equipement } from "@/backend/equipements/infrastructure/mongoose/equipement.model";

describe("RecurrenceRepositoryMongoose (contrat)", () => {
  const depot = new RecurrenceRepositoryMongoose();
  let clientId: string;
  let siteId: string;
  let equipeId: string;
  let vehiculeId: string;
  let equipementA: string;
  let equipementB: string;

  const saisie = (surcharge: Partial<RecurrenceSaisie> = {}): RecurrenceSaisie => ({
    clientId,
    siteId,
    natureIntervention: "Collecte",
    frequence: "hebdomadaire",
    heurePrevue: "08:00",
    dureeEstimeeMinutes: 120,
    equipementIds: [],
    informationsParticulieres: "",
    active: true,
    ...surcharge,
  });

  beforeEach(async () => {
    const client = await Client.create({ nom: "Client A", contact: { telephone: "0102" } });
    const site = await Site.create({ clientId: client._id, nom: "Site A", adresse: "Rue 1", typeDechets: ["Huiles"] });
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

  describe("creer / trouverParId", () => {
    it("crée et renvoie la récurrence avec ses relations peuplées (champs sélectionnés seulement)", async () => {
      const recurrence = await depot.creer(
        saisie({ jourSemaine: 2, equipeId, vehiculeId, equipementIds: [equipementA, equipementB], dureeEstimeeMinutes: 90 })
      );

      const attendu = {
        id: expect.stringMatching(/^[a-f\d]{24}$/),
        clientId: { id: clientId, nom: "Client A" },
        siteId: { id: siteId, nom: "Site A", adresse: "Rue 1" },
        natureIntervention: "Collecte",
        frequence: "hebdomadaire",
        jourSemaine: 2,
        heurePrevue: "08:00",
        dureeEstimeeMinutes: 90,
        equipeId: { id: equipeId, nom: "Équipe A" },
        vehiculeId: { id: vehiculeId, identification: "V-001" },
        equipementIds: [
          { id: equipementA, nom: "Pompe" },
          { id: equipementB, nom: "Bac" },
        ],
        informationsParticulieres: "",
        active: true,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        revision: 0,
      };
      expect(recurrence).toEqual(attendu);
      expect(await depot.trouverParId(recurrence.id)).toEqual(attendu);
    });

    it("clés facultatives non fournies : absentes de l'entité (pas null)", async () => {
      const recurrence = await depot.creer(saisie({ frequence: "mensuelle" }));
      for (const cle of ["jourSemaine", "jourMois", "intervalleJours", "equipeId", "vehiculeId", "derniereGeneration"]) {
        expect(recurrence, cle).not.toHaveProperty(cle);
      }
    });

    it("trouverParId : null si la récurrence n'existe pas", async () => {
      expect(await depot.trouverParId(String(new mongoose.Types.ObjectId()))).toBeNull();
    });

    it("références pendantes : null réel ; équipement supprimé retiré", async () => {
      const { id } = await depot.creer(saisie({ equipeId, equipementIds: [equipementA, equipementB] }));
      await Client.deleteOne({ _id: clientId });
      await Equipe.deleteOne({ _id: equipeId });
      await Equipement.deleteOne({ _id: equipementA });

      const recurrence = await depot.trouverParId(id);

      expect(recurrence?.clientId).toBeNull();
      expect(recurrence?.equipeId).toBeNull();
      expect(recurrence?.siteId).toEqual({ id: siteId, nom: "Site A", adresse: "Rue 1" });
      expect(recurrence?.equipementIds).toEqual([{ id: equipementB, nom: "Bac" }]);
    });

    it("document écrit hors Mongoose : valeurs par défaut du schéma", async () => {
      const { insertedId } = await RecurrenceModel.collection.insertOne({
        clientId: new mongoose.Types.ObjectId(clientId),
        siteId: new mongoose.Types.ObjectId(siteId),
        natureIntervention: "Import",
        frequence: "mensuelle",
      });

      expect(await depot.trouverParId(String(insertedId))).toEqual({
        id: String(insertedId),
        clientId: { id: clientId, nom: "Client A" },
        siteId: { id: siteId, nom: "Site A", adresse: "Rue 1" },
        natureIntervention: "Import",
        frequence: "mensuelle",
        heurePrevue: "08:00",
        dureeEstimeeMinutes: 120,
        equipementIds: [],
        informationsParticulieres: "",
        active: true,
      });
    });
  });

  describe("lister", () => {
    it("tri par création décroissante ; filtres client, site, fréquence, active", async () => {
      const autreClient = await Client.create({ nom: "Client B" });
      const autreSite = await Site.create({ clientId: autreClient._id, nom: "Site B" });
      await depot.creer(saisie({ natureIntervention: "A" }));
      await new Promise((resolve) => setTimeout(resolve, 5));
      await depot.creer(
        saisie({
          natureIntervention: "B",
          clientId: String(autreClient._id),
          siteId: String(autreSite._id),
          frequence: "mensuelle",
          active: false,
        })
      );

      const noms = async (filtre: Parameters<typeof depot.lister>[0]) =>
        (await depot.lister(filtre)).map((r) => r.natureIntervention);

      expect(await noms({})).toEqual(["B", "A"]);
      expect(await noms({ clientId })).toEqual(["A"]);
      expect(await noms({ siteId: String(autreSite._id) })).toEqual(["B"]);
      expect(await noms({ frequence: "mensuelle" })).toEqual(["B"]);
      expect(await noms({ frequence: "bidon" })).toEqual([]);
      expect(await noms({ active: true })).toEqual(["A"]);
      expect(await noms({ active: false })).toEqual(["B"]);
    });

    it("filtre illisible : l'erreur Mongoose remonte", async () => {
      await expect(depot.lister({ clientId: "abc" })).rejects.toThrow(/Cast to ObjectId failed/);
    });
  });

  describe("modifier", () => {
    it("une clé absente de la saisie laisse la valeur stockée intacte ; les clés présentes sont réécrites", async () => {
      const { id } = await depot.creer(saisie({ jourSemaine: 2, equipeId, vehiculeId, equipementIds: [equipementA], active: false }));

      const recurrence = await depot.modifier(id, saisie({ natureIntervention: "Modifiée", frequence: "mensuelle", jourMois: 12 }));

      expect(recurrence).toMatchObject({
        id,
        natureIntervention: "Modifiée",
        frequence: "mensuelle",
        jourMois: 12,
        jourSemaine: 2,
        equipeId: { id: equipeId, nom: "Équipe A" },
        vehiculeId: { id: vehiculeId, identification: "V-001" },
        equipementIds: [],
        active: true,
      });
    });

    it("null si la récurrence n'existe pas", async () => {
      expect(await depot.modifier(String(new mongoose.Types.ObjectId()), saisie())).toBeNull();
    });
  });

  describe("supprimer", () => {
    it("true puis false", async () => {
      const { id } = await depot.creer(saisie());
      expect(await depot.supprimer(id)).toBe(true);
      expect(await depot.supprimer(id)).toBe(false);
    });
  });

  describe("listerActives / avancerAncre", () => {
    it("récurrences actives seulement, relations en identifiants bruts", async () => {
      const active = await depot.creer(saisie({ jourSemaine: 3, equipeId, vehiculeId, equipementIds: [equipementA] }));
      await depot.creer(saisie({ natureIntervention: "Inactive", active: false }));

      expect(await depot.listerActives()).toEqual([
        {
          id: active.id,
          clientId,
          siteId,
          natureIntervention: "Collecte",
          frequence: "hebdomadaire",
          jourSemaine: 3,
          heurePrevue: "08:00",
          dureeEstimeeMinutes: 120,
          equipeId,
          vehiculeId,
          equipementIds: [equipementA],
          informationsParticulieres: "",
          createdAt: expect.any(Date),
        },
      ]);
    });

    it("avancerAncre enregistre la date ; elle est relue par listerActives et trouverParId", async () => {
      const { id } = await depot.creer(saisie());
      const date = new Date("2030-11-05T08:00:00.000Z");

      await depot.avancerAncre(id, date);

      expect((await depot.listerActives())[0].derniereGeneration).toEqual(date);
      expect((await depot.trouverParId(id))?.derniereGeneration).toEqual(date);
    });
  });
});
