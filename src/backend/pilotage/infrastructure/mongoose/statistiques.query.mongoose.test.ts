import { describe, it, expect, beforeEach } from "vitest";
import { Operation } from "@/backend/operations/infrastructure/mongoose/operation.model";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Site } from "@/backend/clients-sites/infrastructure/mongoose/site.model";
import { Equipe } from "@/backend/equipes/infrastructure/mongoose/equipe.model";
import { StatistiquesQueryMongoose } from "./statistiques.query.mongoose";

const h = (heure: number, minute = 0) => new Date(2030, 10, 4, heure, minute, 0, 0);
const DEBUT = new Date(2030, 10, 4, 0, 0, 0, 0);
const FIN = new Date(2030, 10, 4, 23, 59, 59, 999);

describe("StatistiquesQueryMongoose (contrat)", () => {
  const query = new StatistiquesQueryMongoose();
  let clientId: string;
  let siteId: string;
  let equipeId: string;

  const creer = async (natureIntervention: string, dateHeurePrevue: Date, surcharge: Record<string, unknown> = {}) =>
    String((await Operation.create({ clientId, siteId, natureIntervention, dateHeurePrevue, ...surcharge }))._id);

  beforeEach(async () => {
    const client = await Client.create({ nom: "Client A", contact: { telephone: "0102" } });
    const site = await Site.create({ clientId: client._id, nom: "Site A", adresse: "Rue 1" });
    const equipe = await Equipe.create({ nom: "Équipe A", membres: ["Ali"] });
    clientId = String(client._id);
    siteId = String(site._id);
    equipeId = String(equipe._id);
  });

  it("operationsSuivies : toutes les opérations, dans l'ordre de la base, réduites aux champs de suivi", async () => {
    const a = await creer("A", h(9), { statut: "En cours", photos: [{ url: "data:image/png;base64,AAAA", nom: "a.png" }] });
    const b = await creer("B", h(7), { statut: "Annulée" });

    expect(await query.operationsSuivies()).toEqual([
      { id: a, natureIntervention: "A", dateHeurePrevue: h(9), statut: "En cours" },
      { id: b, natureIntervention: "B", dateHeurePrevue: h(7), statut: "Annulée" },
    ]);
  });

  it("compterClientsEtSites", async () => {
    await Site.create({ clientId, nom: "Site B" });
    expect(await query.compterClientsEtSites()).toEqual({ totalClients: 1, totalSites: 2 });
  });

  it("operationsDuJour : bornes incluses, tri par heure, client et site peuplés par leur nom seul", async () => {
    const midi = await creer("Midi", h(12));
    const debut = await creer("Début", DEBUT);
    const fin = await creer("Fin", FIN);
    await creer("Veille", new Date(DEBUT.getTime() - 1));
    await creer("Lendemain", new Date(FIN.getTime() + 1));

    const operations = await query.operationsDuJour(DEBUT, FIN, { avecEquipe: false });

    expect(operations.map((o) => String(o._id))).toEqual([debut, midi, fin]);
    const json = JSON.parse(JSON.stringify(operations[1]));
    expect(json.clientId).toEqual({ _id: clientId, nom: "Client A" });
    expect(json.siteId).toEqual({ _id: siteId, nom: "Site A" });
    expect(json).toMatchObject({ natureIntervention: "Midi", statut: "Planifiée", dureeEstimeeMinutes: 120, photos: [], __v: 0 });
  });

  it("operationsDuJour : l'équipe n'est peuplée que si elle est demandée", async () => {
    await creer("Affectée", h(12), { equipeId });

    const sans = JSON.parse(JSON.stringify(await query.operationsDuJour(DEBUT, FIN, { avecEquipe: false })));
    expect(sans[0].equipeId).toBe(equipeId);

    const avec = JSON.parse(JSON.stringify(await query.operationsDuJour(DEBUT, FIN, { avecEquipe: true })));
    expect(avec[0].equipeId).toEqual({ _id: equipeId, nom: "Équipe A" });
  });

  it("operationsDuJour : relation supprimée → null", async () => {
    await creer("Orpheline", h(12));
    await Client.deleteMany({});
    const [operation] = await query.operationsDuJour(DEBUT, FIN, { avecEquipe: true });
    expect(operation.clientId).toBeNull();
  });
});
