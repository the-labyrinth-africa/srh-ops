import mongoose from "mongoose";
import { beforeEach, describe, expect, it } from "vitest";
import {
  enregistrerAffectationTournee,
  enregistrerPointageTournee,
  listerAffectationsDuJour,
  listerHistoriqueVisites,
} from "./affectations";
import { AffectationTournee } from "./infrastructure/mongoose/affectation-tournee.model";

const DATE = "2037-04-15";
const EQUIPE_A = new mongoose.Types.ObjectId().toString();
const EQUIPE_B = new mongoose.Types.ObjectId().toString();
const VEHICULE_A = new mongoose.Types.ObjectId().toString();
const CLIENT_ID = new mongoose.Types.ObjectId().toString();
const SITE_IDS = Array.from({ length: 5 }, () => new mongoose.Types.ObjectId().toString());

function saisie(tournee: string, equipeId = EQUIPE_A, vehiculeId = VEHICULE_A) {
  return {
    date: DATE,
    tournee,
    secteur: "Nord",
    equipeId,
    vehiculeId,
    volumeEstimeLitres: 500,
    dureeEstimeeMinutes: 600,
    stations: SITE_IDS.map((siteId, index) => ({
      site: `Station ${index + 1}`,
      commune: "Cocody",
      siteId,
      clientId: CLIENT_ID,
      quantiteEstimeeLitres: 100,
      dureeEstimeeMinutes: 120,
    })),
  };
}

describe("Affectations des tournées prévisionnelles", () => {
  beforeEach(async () => {
    await AffectationTournee.deleteMany({ date: DATE });
  });

  it("affecte une tournée persistée à une équipe et la retrouve pour cette équipe uniquement", async () => {
    const resultat = await enregistrerAffectationTournee(saisie("Tournée 1"));
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    expect(resultat.affectation).toMatchObject({
      date: DATE,
      tournee: "Tournée 1",
      equipeId: EQUIPE_A,
      vehiculeId: VEHICULE_A,
      stations: expect.arrayContaining([expect.objectContaining({ site: "Station 1" })]),
    });
    expect((await listerAffectationsDuJour(DATE, EQUIPE_A)).map((item) => item.tournee)).toEqual(["Tournée 1"]);
    expect(await listerAffectationsDuJour(DATE, EQUIPE_B)).toEqual([]);
  });

  it("empêche de réutiliser une équipe ou un camion sur une autre tournée le même jour", async () => {
    expect((await enregistrerAffectationTournee(saisie("Tournée 1"))).ok).toBe(true);

    await expect(enregistrerAffectationTournee(saisie("Tournée 2", EQUIPE_A, new mongoose.Types.ObjectId().toString())))
      .resolves.toMatchObject({ ok: false, code: "equipe-occupee" });
    await expect(enregistrerAffectationTournee(saisie("Tournée 3", EQUIPE_B, VEHICULE_A)))
      .resolves.toMatchObject({ ok: false, code: "vehicule-occupe" });
  });

  it("enregistre arrivée, départ à zéro litre et conserve les horaires comme historique", async () => {
    const resultat = await enregistrerAffectationTournee(saisie("Tournée 1"));
    if (!resultat.ok) throw new Error("L’affectation de test aurait dû être créée.");
    const id = resultat.affectation._id;
    if (!id) throw new Error("L’identifiant de l’affectation de test est absent.");

    const arrivee = new Date("2037-04-15T08:00:00.000Z");
    const depart = new Date("2037-04-15T08:30:00.000Z");
    const resultatArrivee = await enregistrerPointageTournee({
      affectationId: id,
      equipeId: EQUIPE_A,
      indexStation: 0,
      action: "arrivee",
      maintenant: arrivee,
    });
    expect(resultatArrivee.ok).toBe(true);

    await expect(enregistrerPointageTournee({
      affectationId: id,
      equipeId: EQUIPE_B,
      indexStation: 0,
      action: "depart",
      quantiteCollectee: 0,
      maintenant: depart,
    })).resolves.toMatchObject({ ok: false, code: "hors-equipe" });

    const resultatDepart = await enregistrerPointageTournee({
      affectationId: id,
      equipeId: EQUIPE_A,
      indexStation: 0,
      action: "depart",
      quantiteCollectee: 0,
      maintenant: depart,
    });
    expect(resultatDepart.ok).toBe(true);
    expect(resultatDepart.ok && resultatDepart.station).toMatchObject({
      dateHeureArrivee: arrivee,
      dateHeureDepart: depart,
      quantiteCollectee: 0,
    });
    expect(await listerHistoriqueVisites()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        site: "Station 1",
        date: depart,
        quantite: 0,
        dateHeureArrivee: arrivee,
        dateHeureDepart: depart,
      }),
    ]));
    await expect(enregistrerAffectationTournee(saisie("Tournée 1")))
      .resolves.toMatchObject({ ok: false, code: "tournee-commencee" });
  });

  it("limite le chauffeur à la date prévue de sa tournée", async () => {
    const resultat = await enregistrerAffectationTournee(saisie("Tournée 1"));
    if (!resultat.ok) throw new Error("L’affectation de test aurait dû être créée.");
    const id = resultat.affectation._id;
    if (!id) throw new Error("L’identifiant de l’affectation de test est absent.");

    await expect(enregistrerPointageTournee({
      affectationId: id,
      equipeId: EQUIPE_A,
      indexStation: 0,
      action: "arrivee",
      dateAutorisee: "2037-04-14",
      maintenant: new Date("2037-04-15T08:00:00.000Z"),
    })).resolves.toMatchObject({ ok: false, code: "date-non-autorisee" });
  });
});
