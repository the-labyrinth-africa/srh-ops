import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { Operation } from "@/models/Operation";
import { AffectationsMongoose } from "./affectations.mongoose";

const id = () => new mongoose.Types.ObjectId();
const h = (heure: string) => new Date(`2026-10-01T${heure}:00Z`);

async function creer(surcharge: Record<string, unknown> = {}) {
  const doc = await Operation.create({
    clientId: id(),
    siteId: id(),
    natureIntervention: "Collecte",
    dateHeurePrevue: h("08:00"),
    dureeEstimeeMinutes: 90,
    statut: "Affectée",
    ...surcharge,
  });
  return String(doc._id);
}

describe("AffectationsMongoose (contrat)", () => {
  const affectations = new AffectationsMongoose();

  it("renvoie l'opération de l'équipe, avec des identifiants en chaînes", async () => {
    const equipeId = id();
    const vehiculeId = id();
    const operationId = await creer({ equipeId, vehiculeId });

    const candidates = await affectations.candidates({ debutAvant: h("12:00"), equipeId: String(equipeId) });

    expect(candidates).toEqual([
      {
        operationId,
        dateHeurePrevue: h("08:00"),
        dureeEstimeeMinutes: 90,
        equipeId: String(equipeId),
        vehiculeId: String(vehiculeId),
      },
    ]);
  });

  it("équipe OU véhicule : renvoie les deux opérations", async () => {
    const equipeId = id();
    const vehiculeId = id();
    const parEquipe = await creer({ equipeId });
    const parVehicule = await creer({ vehiculeId });
    await creer({ equipeId: id(), vehiculeId: id() });

    const candidates = await affectations.candidates({
      debutAvant: h("12:00"),
      equipeId: String(equipeId),
      vehiculeId: String(vehiculeId),
    });

    expect(candidates.map((c) => c.operationId).sort()).toEqual([parEquipe, parVehicule].sort());
  });

  it.each(["Annulée", "Terminée", "Rapportée"])("écarte une opération %s", async (statut) => {
    const equipeId = id();
    await creer({ equipeId, statut });
    expect(await affectations.candidates({ debutAvant: h("12:00"), equipeId: String(equipeId) })).toEqual([]);
  });

  it("borne haute exclusive : une opération qui démarre à `debutAvant` est écartée", async () => {
    const equipeId = id();
    await creer({ equipeId, dateHeurePrevue: h("12:00") });
    const juste = await creer({ equipeId, dateHeurePrevue: h("11:59") });

    const candidates = await affectations.candidates({ debutAvant: h("12:00"), equipeId: String(equipeId) });

    expect(candidates.map((c) => c.operationId)).toEqual([juste]);
  });

  it("pas de borne basse : une opération démarrée bien avant reste candidate", async () => {
    const equipeId = id();
    const ancienne = await creer({ equipeId, dateHeurePrevue: new Date("2026-09-01T08:00:00Z") });
    const candidates = await affectations.candidates({ debutAvant: h("12:00"), equipeId: String(equipeId) });
    expect(candidates.map((c) => c.operationId)).toEqual([ancienne]);
  });

  it("écarte l'opération à exclure", async () => {
    const equipeId = id();
    const operationId = await creer({ equipeId });
    expect(
      await affectations.candidates({
        debutAvant: h("12:00"),
        equipeId: String(equipeId),
        exclureOperationId: operationId,
      })
    ).toEqual([]);
  });

  it("document écrit hors Mongoose, sans durée ni véhicule : champs absents, pas de valeur inventée", async () => {
    const equipeId = id();
    const { insertedId } = await Operation.collection.insertOne({
      clientId: id(),
      siteId: id(),
      natureIntervention: "Import",
      dateHeurePrevue: h("08:00"),
      equipeId,
      statut: "Planifiée",
    });

    const candidates = await affectations.candidates({ debutAvant: h("12:00"), equipeId: String(equipeId) });

    expect(candidates).toEqual([
      {
        operationId: String(insertedId),
        dateHeurePrevue: h("08:00"),
        dureeEstimeeMinutes: undefined,
        equipeId: String(equipeId),
        vehiculeId: undefined,
      },
    ]);
  });

  it("sans équipe ni véhicule : aucune candidate (pas de `$or` vide envoyé à Mongo)", async () => {
    await creer({ equipeId: id() });
    expect(await affectations.candidates({ debutAvant: h("12:00") })).toEqual([]);
  });
});
