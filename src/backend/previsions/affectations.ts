import mongoose from "mongoose";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type { HistoriqueCollecte } from "./collectes";
import {
  AffectationTournee,
  type IAffectationTournee,
  type IStationAffectationTournee,
} from "./infrastructure/mongoose/affectation-tournee.model";

export interface StationAffectationSaisie extends Omit<IStationAffectationTournee, "siteId" | "clientId"> {
  siteId?: string;
  clientId?: string;
}

export interface AffectationTourneeSaisie {
  date: string;
  tournee: string;
  secteur: string;
  equipeId: string;
  vehiculeId: string;
  volumeEstimeLitres: number;
  dureeEstimeeMinutes: number;
  stations: StationAffectationSaisie[];
}

export type ActionPointage = "arrivee" | "depart";

export type ResultatPointage =
  | { ok: true; affectation: IAffectationTournee; station: IStationAffectationTournee }
  | { ok: false; code: "introuvable" | "hors-equipe" | "date-non-autorisee" | "station-invalide" | "arrivee-requise" | "deja-terminee" };

export type ResultatAffectation =
  | { ok: true; affectation: ReturnType<typeof documentJson> }
  | { ok: false; code: "tournee-commencee" | "equipe-occupee" | "vehicule-occupe" };

function documentJson(affectation: IAffectationTournee) {
  return {
    ...affectation,
    _id: String(affectation._id),
    equipeId: String(affectation.equipeId),
    vehiculeId: String(affectation.vehiculeId),
    stations: affectation.stations.map((station) => ({
      ...station,
      ...(station.siteId ? { siteId: String(station.siteId) } : {}),
      ...(station.clientId ? { clientId: String(station.clientId) } : {}),
    })),
  };
}

export async function listerAffectationsDuMois(mois: string) {
  await connectDB();
  const affectations = await AffectationTournee.find({
    date: { $gte: `${mois}-01`, $lte: `${mois}-31` },
  }).sort({ date: 1, tournee: 1 }).lean();
  return affectations.map((affectation) => documentJson(affectation as IAffectationTournee));
}

export async function listerAffectationsDuJour(date: string, equipeId: string) {
  await connectDB();
  const affectations = await AffectationTournee.find({ date, equipeId }).sort({ tournee: 1 }).lean();
  return affectations.map((affectation) => documentJson(affectation as IAffectationTournee));
}

export async function enregistrerAffectationTournee(saisie: AffectationTourneeSaisie): Promise<ResultatAffectation> {
  await connectDB();
  const existante = await AffectationTournee.findOne({ date: saisie.date, tournee: saisie.tournee });
  if (existante?.stations.some((station) => station.dateHeureArrivee || station.dateHeureDepart)) {
    return { ok: false, code: "tournee-commencee" };
  }

  const equipeObjectId = new mongoose.Types.ObjectId(saisie.equipeId);
  const vehiculeObjectId = new mongoose.Types.ObjectId(saisie.vehiculeId);
  const conflit = await AffectationTournee.findOne({
    date: saisie.date,
    tournee: { $ne: saisie.tournee },
    $or: [{ equipeId: equipeObjectId }, { vehiculeId: vehiculeObjectId }],
  }).lean();
  if (conflit) {
    if (String(conflit.equipeId) === saisie.equipeId) return { ok: false, code: "equipe-occupee" };
    return { ok: false, code: "vehicule-occupe" };
  }

  const donnees = {
    ...saisie,
    equipeId: equipeObjectId,
    vehiculeId: vehiculeObjectId,
    stations: saisie.stations.map((station) => ({
      ...station,
      ...(station.siteId ? { siteId: new mongoose.Types.ObjectId(station.siteId) } : {}),
      ...(station.clientId ? { clientId: new mongoose.Types.ObjectId(station.clientId) } : {}),
    })),
  };

  const affectation = existante
    ? await AffectationTournee.findByIdAndUpdate(existante._id, donnees, { new: true, runValidators: true })
    : await AffectationTournee.create(donnees);

  return affectation
    ? { ok: true, affectation: documentJson(affectation.toObject() as IAffectationTournee) }
    : { ok: false, code: "tournee-commencee" };
}

export async function enregistrerPointageTournee({
  affectationId,
  equipeId,
  indexStation,
  action,
  quantiteCollectee,
  dateAutorisee,
  maintenant = new Date(),
}: {
  affectationId: string;
  equipeId?: string;
  indexStation: number;
  action: ActionPointage;
  quantiteCollectee?: number;
  dateAutorisee?: string;
  maintenant?: Date;
}): Promise<ResultatPointage> {
  await connectDB();
  const affectation = await AffectationTournee.findById(affectationId);
  if (!affectation) return { ok: false, code: "introuvable" };
  if (equipeId && String(affectation.equipeId) !== equipeId) return { ok: false, code: "hors-equipe" };
  if (dateAutorisee && affectation.date !== dateAutorisee) return { ok: false, code: "date-non-autorisee" };
  const station = affectation.stations[indexStation];
  if (!station) return { ok: false, code: "station-invalide" };

  if (action === "arrivee") {
    if (!station.dateHeureArrivee) station.dateHeureArrivee = maintenant;
    await affectation.save();
    return { ok: true, affectation: affectation.toObject() as IAffectationTournee, station };
  }

  if (!station.dateHeureArrivee) return { ok: false, code: "arrivee-requise" };
  if (station.dateHeureDepart) {
    if (station.quantiteCollectee !== quantiteCollectee) return { ok: false, code: "deja-terminee" };
    return { ok: true, affectation: affectation.toObject() as IAffectationTournee, station };
  }

  if (maintenant < station.dateHeureArrivee) return { ok: false, code: "arrivee-requise" };
  station.dateHeureDepart = maintenant;
  station.quantiteCollectee = quantiteCollectee ?? 0;
  await affectation.save();
  return { ok: true, affectation: affectation.toObject() as IAffectationTournee, station };
}

export async function listerHistoriqueVisites(): Promise<HistoriqueCollecte[]> {
  await connectDB();
  const affectations = await AffectationTournee.find({
    "stations.dateHeureDepart": { $exists: true },
  }).select("stations").lean();

  return affectations.flatMap((affectation) =>
    (affectation as IAffectationTournee).stations.flatMap((station) => {
      if (!station.dateHeureDepart) return [];
      return [{
        site: station.site,
        date: station.dateHeureDepart,
        quantite: station.quantiteCollectee ?? 0,
        dateHeureArrivee: station.dateHeureArrivee,
        dateHeureDepart: station.dateHeureDepart,
      }];
    })
  );
}
