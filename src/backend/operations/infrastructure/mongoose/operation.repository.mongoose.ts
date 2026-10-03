import mongoose from "mongoose";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type { OperationStatus } from "@/shared/operations/statuts";
import type { QuantiteUnite } from "@/shared/operations/quantites";
import type {
  EntreeHistorique,
  EquipePeuplee,
  EquipementPeuple,
  FiltreOperations,
  Operation,
  OperationSaisie,
  Pagination,
  PhotoOperation,
  Reference,
  StatutInitial,
  VehiculePeuple,
} from "../../domain/operation";
import type { ChangementStatut, EtatTerrain } from "../../domain/changement-statut";
import type { OperationRepository } from "../../domain/ports";
import { Operation as OperationModel } from "./operation.model";

/** Document tel que renvoyé par `.lean()` : chaque relation est un ObjectId, un document peuplé ou `null`. */
interface DocumentOperation {
  _id: unknown;
  clientId?: unknown;
  siteId?: unknown;
  natureIntervention: string;
  dateHeurePrevue: Date;
  dureeEstimeeMinutes?: number;
  equipeId?: unknown;
  vehiculeId?: unknown;
  equipementIds?: unknown[];
  informationsParticulieres?: string;
  statut?: OperationStatus;
  historiqueStatuts?: { statut: OperationStatus; date: Date; parUtilisateur?: unknown; ancienStatut?: OperationStatus }[];
  quantiteCollectee?: number;
  uniteQuantite?: QuantiteUnite;
  remarquesTerrain?: string;
  nomSignataireClient?: string;
  signatureClient?: string;
  photos?: { url: string; nom?: string; uploadedAt: Date }[];
  rapportPdf?: string;
  createdAt?: Date;
  updatedAt?: Date;
  __v?: number;
}

type Peuplement = { path: string; select: string };

// Champs sélectionnés par relation, repris à l'identique des routes d'origine.
const RESUME: Peuplement[] = [
  { path: "clientId", select: "nom" },
  { path: "siteId", select: "nom" },
  { path: "equipeId", select: "nom" },
  { path: "vehiculeId", select: "identification" },
];

const LISTE: Peuplement[] = [
  { path: "clientId", select: "nom" },
  { path: "siteId", select: "nom adresse" },
  { path: "equipeId", select: "nom" },
  { path: "vehiculeId", select: "identification" },
];

const DETAIL: Peuplement[] = [
  { path: "clientId", select: "nom contact" },
  { path: "siteId", select: "nom adresse typeDechets" },
  { path: "equipeId", select: "nom membres" },
  { path: "vehiculeId", select: "identification type" },
  { path: "equipementIds", select: "nom type" },
  { path: "historiqueStatuts.parUtilisateur", select: "nom" },
];

// Réponse d'un changement de statut : comme la liste, plus le nom des équipements.
const TERRAIN: Peuplement[] = [
  { path: "clientId", select: "nom" },
  { path: "siteId", select: "nom adresse" },
  { path: "equipeId", select: "nom" },
  { path: "vehiculeId", select: "identification" },
  { path: "equipementIds", select: "nom" },
];

/**
 * Trois issues (leçon R2) : `null`/absent → `null` (référence pendante), ObjectId → identifiant
 * brut, document peuplé → `{ id, ...champs sélectionnés }` (seuls les champs réellement présents).
 */
function versReference<T extends { id: string }>(valeur: unknown): Reference<T> {
  if (valeur == null) return null;
  if (valeur instanceof mongoose.Types.ObjectId || typeof valeur !== "object") return String(valeur);
  const { _id, ...champs } = valeur as { _id: unknown } & Record<string, unknown>;
  return { id: String(_id), ...champs } as unknown as T;
}

/** Relation facultative : absente du document → absente de l'entité (pas `null`). */
function versReferenceFacultative<T extends { id: string }>(valeur: unknown): Reference<T> | undefined {
  return valeur === undefined ? undefined : versReference<T>(valeur);
}

function versEntree(entree: NonNullable<DocumentOperation["historiqueStatuts"]>[number]): EntreeHistorique {
  const resultat: EntreeHistorique = { statut: entree.statut, date: entree.date };
  if (entree.parUtilisateur !== undefined) resultat.parUtilisateur = versReference(entree.parUtilisateur);
  if (entree.ancienStatut !== undefined) resultat.ancienStatut = entree.ancienStatut;
  return resultat;
}

function versPhoto(photo: NonNullable<DocumentOperation["photos"]>[number]): PhotoOperation {
  return { url: photo.url, nom: photo.nom ?? "", uploadedAt: photo.uploadedAt };
}

function versEntite(doc: DocumentOperation): Operation {
  const operation: Operation = {
    id: String(doc._id),
    clientId: versReference(doc.clientId),
    siteId: versReference(doc.siteId),
    natureIntervention: doc.natureIntervention,
    dateHeurePrevue: doc.dateHeurePrevue,
    dureeEstimeeMinutes: doc.dureeEstimeeMinutes ?? 120,
    // Un équipement supprimé a déjà été retiré du tableau par `.populate()`.
    equipementIds: (doc.equipementIds ?? []).map((equipement) => versReference<EquipementPeuple>(equipement) as string | EquipementPeuple),
    informationsParticulieres: doc.informationsParticulieres ?? "",
    statut: doc.statut ?? "Planifiée",
    historiqueStatuts: (doc.historiqueStatuts ?? []).map(versEntree),
    uniteQuantite: doc.uniteQuantite ?? "Litres",
    remarquesTerrain: doc.remarquesTerrain ?? "",
    nomSignataireClient: doc.nomSignataireClient ?? "",
    signatureClient: doc.signatureClient ?? "",
    photos: (doc.photos ?? []).map(versPhoto),
    rapportPdf: doc.rapportPdf ?? "",
  };
  // Champs facultatifs : la clé n'existe que si la valeur existe (les tests comparent les clés).
  const equipe = versReferenceFacultative<EquipePeuplee>(doc.equipeId);
  if (equipe !== undefined) operation.equipeId = equipe;
  const vehicule = versReferenceFacultative<VehiculePeuple>(doc.vehiculeId);
  if (vehicule !== undefined) operation.vehiculeId = vehicule;
  if (doc.quantiteCollectee !== undefined) operation.quantiteCollectee = doc.quantiteCollectee;
  if (doc.createdAt !== undefined) operation.createdAt = doc.createdAt;
  if (doc.updatedAt !== undefined) operation.updatedAt = doc.updatedAt;
  if (doc.__v !== undefined) operation.revision = doc.__v;
  return operation;
}

/** Filtre Mongo : mêmes clés et mêmes valeurs brutes que les routes d'origine (aucune conversion). */
function versFiltreMongo(filtre: FiltreOperations): Record<string, unknown> {
  const mongo: Record<string, unknown> = {};
  if (filtre.clientId) mongo.clientId = filtre.clientId;
  if (filtre.siteId) mongo.siteId = filtre.siteId;
  if (filtre.equipeId) mongo.equipeId = filtre.equipeId;
  if (filtre.vehiculeId) mongo.vehiculeId = filtre.vehiculeId;
  if (filtre.statut) mongo.statut = filtre.statut;
  if (filtre.dateDebut || filtre.dateFin) {
    const bornes: Record<string, Date> = {};
    if (filtre.dateDebut) bornes.$gte = filtre.dateDebut;
    if (filtre.dateFin) bornes.$lte = filtre.dateFin;
    mongo.dateHeurePrevue = bornes;
  }
  return mongo;
}

export class OperationRepositoryMongoose implements OperationRepository {
  async lister(filtre: FiltreOperations, { skip, limit }: Pagination): Promise<{ items: Operation[]; total: number }> {
    await connectDB();
    const mongo = versFiltreMongo(filtre);
    const [docs, total] = await Promise.all([
      OperationModel.find(mongo).populate(LISTE).sort({ dateHeurePrevue: -1 }).skip(skip).limit(limit).lean(),
      OperationModel.countDocuments(mongo),
    ]);
    return { items: (docs as unknown as DocumentOperation[]).map(versEntite), total };
  }

  async listerPourPlanning(filtre: FiltreOperations): Promise<Operation[]> {
    await connectDB();
    const docs = await OperationModel.find(versFiltreMongo(filtre)).populate(RESUME).lean();
    return (docs as unknown as DocumentOperation[]).map(versEntite);
  }

  async trouverDetailParId(id: string): Promise<Operation | null> {
    await connectDB();
    const doc = (await OperationModel.findById(id).populate(DETAIL).lean()) as unknown as DocumentOperation | null;
    return doc ? versEntite(doc) : null;
  }

  async creer(saisie: OperationSaisie, initial: StatutInitial): Promise<Operation> {
    await connectDB();
    const cree = await OperationModel.create({
      ...saisie,
      statut: initial.statut,
      historiqueStatuts: [
        {
          statut: initial.statut,
          date: initial.date,
          parUtilisateur: new mongoose.Types.ObjectId(initial.parUtilisateur),
        },
      ],
    });
    const doc = (await OperationModel.findById(cree._id).populate(RESUME).lean()) as unknown as DocumentOperation;
    return versEntite(doc);
  }

  async modifier(id: string, saisie: OperationSaisie): Promise<Operation | null> {
    await connectDB();
    const doc = (await OperationModel.findByIdAndUpdate(id, saisie, { new: true })
      .populate(RESUME)
      .lean()) as unknown as DocumentOperation | null;
    return doc ? versEntite(doc) : null;
  }

  async supprimer(id: string): Promise<boolean> {
    await connectDB();
    return Boolean(await OperationModel.findByIdAndDelete(id));
  }

  async trouverEtatTerrain(id: string): Promise<EtatTerrain | null> {
    await connectDB();
    const doc = (await OperationModel.findById(id).lean()) as unknown as DocumentOperation | null;
    if (!doc) return null;
    const etat: EtatTerrain = {
      statut: doc.statut ?? "Planifiée",
      photos: (doc.photos ?? []).map((photo) => ({ url: photo.url })),
    };
    if (doc.equipeId !== undefined) etat.equipeId = doc.equipeId === null ? null : String(doc.equipeId);
    return etat;
  }

  // Les trois écritures suivantes chargent le document, le modifient et l'enregistrent (`save()`),
  // comme les routes d'origine : la révision `__v` renvoyée aux clients en dépend.

  async changerStatut(id: string, changement: ChangementStatut): Promise<Operation | null> {
    await connectDB();
    const doc = await OperationModel.findById(id);
    if (!doc) return null;

    doc.statut = changement.statut;
    if (changement.quantiteCollectee !== undefined) doc.quantiteCollectee = changement.quantiteCollectee;
    // Véracité (et non `!== undefined`) : une unité vide est ignorée, comme dans la route d'origine.
    if (changement.uniteQuantite) doc.uniteQuantite = changement.uniteQuantite;
    if (changement.remarquesTerrain !== undefined) doc.remarquesTerrain = changement.remarquesTerrain;
    if (changement.nomSignataireClient !== undefined) doc.nomSignataireClient = changement.nomSignataireClient;
    if (changement.signatureClient !== undefined) doc.signatureClient = changement.signatureClient;
    if (changement.photos !== undefined) doc.photos = changement.photos;

    doc.historiqueStatuts.push({
      statut: changement.statut,
      date: changement.date,
      parUtilisateur: new mongoose.Types.ObjectId(changement.parUtilisateur),
      ancienStatut: changement.ancienStatut,
    });

    await doc.save();

    const relu = (await OperationModel.findById(id).populate(TERRAIN).lean()) as unknown as DocumentOperation;
    return versEntite(relu);
  }

  async ajouterPhoto(id: string, photo: PhotoOperation): Promise<boolean> {
    await connectDB();
    const doc = await OperationModel.findById(id);
    if (!doc) return false;
    doc.photos.push(photo);
    await doc.save();
    return true;
  }

  async retirerPhotos(id: string, url: string): Promise<boolean> {
    await connectDB();
    const doc = await OperationModel.findById(id);
    if (!doc) return false;
    doc.photos = doc.photos.filter((photo: { url: string }) => photo.url !== url);
    await doc.save();
    return true;
  }
}
