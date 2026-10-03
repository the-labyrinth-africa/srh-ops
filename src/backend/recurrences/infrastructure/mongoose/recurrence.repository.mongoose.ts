import mongoose from "mongoose";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type { RecurrenceFrequency } from "@/shared/recurrences/frequence";
import type {
  EquipePeuplee,
  EquipementPeuple,
  FiltreRecurrences,
  Recurrence,
  RecurrencePlanifiable,
  RecurrenceSaisie,
  Reference,
  VehiculePeuple,
} from "../../domain/recurrence";
import type { RecurrenceRepository } from "../../domain/ports";
import { Recurrence as RecurrenceModel } from "./recurrence.model";

/** Document tel que renvoyé par `.lean()` : chaque relation est un ObjectId, un document peuplé ou `null`. */
interface DocumentRecurrence {
  _id: unknown;
  clientId?: unknown;
  siteId?: unknown;
  natureIntervention: string;
  frequence: RecurrenceFrequency;
  jourSemaine?: number;
  jourMois?: number;
  intervalleJours?: number;
  heurePrevue?: string;
  dureeEstimeeMinutes?: number;
  equipeId?: unknown;
  vehiculeId?: unknown;
  equipementIds?: unknown[];
  informationsParticulieres?: string;
  active?: boolean;
  derniereGeneration?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  __v?: number;
}

// Champs sélectionnés par relation, repris à l'identique des routes d'origine (toutes les réponses).
const PEUPLEMENT = [
  { path: "clientId", select: "nom" },
  { path: "siteId", select: "nom adresse" },
  { path: "equipeId", select: "nom" },
  { path: "vehiculeId", select: "identification" },
  { path: "equipementIds", select: "nom" },
];

/**
 * Trois issues (leçon R2) : `null`/absent → `null` (référence pendante), ObjectId → identifiant
 * brut, document peuplé → `{ id, ...champs sélectionnés }`.
 */
function versReference<T extends { id: string }>(valeur: unknown): Reference<T> {
  if (valeur == null) return null;
  if (valeur instanceof mongoose.Types.ObjectId || typeof valeur !== "object") return String(valeur);
  const { _id, ...champs } = valeur as { _id: unknown } & Record<string, unknown>;
  return { id: String(_id), ...champs } as unknown as T;
}

function versEntite(doc: DocumentRecurrence): Recurrence {
  const recurrence: Recurrence = {
    id: String(doc._id),
    clientId: versReference(doc.clientId),
    siteId: versReference(doc.siteId),
    natureIntervention: doc.natureIntervention,
    frequence: doc.frequence,
    heurePrevue: doc.heurePrevue ?? "08:00",
    dureeEstimeeMinutes: doc.dureeEstimeeMinutes ?? 120,
    // Un équipement supprimé a déjà été retiré du tableau par `.populate()`.
    equipementIds: (doc.equipementIds ?? []).map(
      (equipement) => versReference<EquipementPeuple>(equipement) as string | EquipementPeuple
    ),
    informationsParticulieres: doc.informationsParticulieres ?? "",
    active: doc.active ?? true,
  };
  // Champs facultatifs : la clé n'existe que si la valeur existe.
  if (doc.jourSemaine !== undefined) recurrence.jourSemaine = doc.jourSemaine;
  if (doc.jourMois !== undefined) recurrence.jourMois = doc.jourMois;
  if (doc.intervalleJours !== undefined) recurrence.intervalleJours = doc.intervalleJours;
  if (doc.equipeId !== undefined) recurrence.equipeId = versReference<EquipePeuplee>(doc.equipeId);
  if (doc.vehiculeId !== undefined) recurrence.vehiculeId = versReference<VehiculePeuple>(doc.vehiculeId);
  if (doc.derniereGeneration !== undefined) recurrence.derniereGeneration = doc.derniereGeneration;
  if (doc.createdAt !== undefined) recurrence.createdAt = doc.createdAt;
  if (doc.updatedAt !== undefined) recurrence.updatedAt = doc.updatedAt;
  if (doc.__v !== undefined) recurrence.revision = doc.__v;
  return recurrence;
}

/** Récurrence non peuplée, telle que la génération la consomme : aucune valeur par défaut n'est inventée ici. */
function versPlanifiable(doc: DocumentRecurrence): RecurrencePlanifiable {
  const planifiable: RecurrencePlanifiable = {
    id: String(doc._id),
    clientId: String(doc.clientId),
    siteId: String(doc.siteId),
    natureIntervention: doc.natureIntervention,
    frequence: doc.frequence,
    createdAt: doc.createdAt as Date,
  };
  if (doc.jourSemaine !== undefined) planifiable.jourSemaine = doc.jourSemaine;
  if (doc.jourMois !== undefined) planifiable.jourMois = doc.jourMois;
  if (doc.intervalleJours !== undefined) planifiable.intervalleJours = doc.intervalleJours;
  if (doc.heurePrevue !== undefined) planifiable.heurePrevue = doc.heurePrevue;
  if (doc.dureeEstimeeMinutes !== undefined) planifiable.dureeEstimeeMinutes = doc.dureeEstimeeMinutes;
  if (doc.equipeId != null) planifiable.equipeId = String(doc.equipeId);
  if (doc.vehiculeId != null) planifiable.vehiculeId = String(doc.vehiculeId);
  if (doc.equipementIds !== undefined) planifiable.equipementIds = doc.equipementIds.map(String);
  if (doc.informationsParticulieres !== undefined) planifiable.informationsParticulieres = doc.informationsParticulieres;
  if (doc.derniereGeneration !== undefined) planifiable.derniereGeneration = doc.derniereGeneration;
  return planifiable;
}

/** Filtre Mongo : mêmes clés et mêmes valeurs brutes que la route d'origine (aucune conversion). */
function versFiltreMongo(filtre: FiltreRecurrences): Record<string, unknown> {
  const mongo: Record<string, unknown> = {};
  if (filtre.clientId) mongo.clientId = filtre.clientId;
  if (filtre.siteId) mongo.siteId = filtre.siteId;
  if (filtre.frequence) mongo.frequence = filtre.frequence;
  if (filtre.active !== undefined) mongo.active = filtre.active;
  return mongo;
}

export class RecurrenceRepositoryMongoose implements RecurrenceRepository {
  async lister(filtre: FiltreRecurrences): Promise<Recurrence[]> {
    await connectDB();
    const docs = await RecurrenceModel.find(versFiltreMongo(filtre)).populate(PEUPLEMENT).sort({ createdAt: -1 }).lean();
    return (docs as unknown as DocumentRecurrence[]).map(versEntite);
  }

  async trouverParId(id: string): Promise<Recurrence | null> {
    await connectDB();
    const doc = (await RecurrenceModel.findById(id).populate(PEUPLEMENT).lean()) as unknown as DocumentRecurrence | null;
    return doc ? versEntite(doc) : null;
  }

  async creer(saisie: RecurrenceSaisie): Promise<Recurrence> {
    await connectDB();
    const cree = await RecurrenceModel.create(saisie);
    const doc = (await RecurrenceModel.findById(cree._id).populate(PEUPLEMENT).lean()) as unknown as DocumentRecurrence;
    return versEntite(doc);
  }

  async modifier(id: string, saisie: RecurrenceSaisie): Promise<Recurrence | null> {
    await connectDB();
    const doc = (await RecurrenceModel.findByIdAndUpdate(id, saisie, { new: true })
      .populate(PEUPLEMENT)
      .lean()) as unknown as DocumentRecurrence | null;
    return doc ? versEntite(doc) : null;
  }

  async supprimer(id: string): Promise<boolean> {
    await connectDB();
    return Boolean(await RecurrenceModel.findByIdAndDelete(id));
  }

  async listerActives(): Promise<RecurrencePlanifiable[]> {
    await connectDB();
    const docs = (await RecurrenceModel.find({ active: true }).lean()) as unknown as DocumentRecurrence[];
    return docs.map(versPlanifiable);
  }

  async avancerAncre(id: string, derniereGeneration: Date): Promise<void> {
    await connectDB();
    await RecurrenceModel.findByIdAndUpdate(id, { derniereGeneration });
  }
}
