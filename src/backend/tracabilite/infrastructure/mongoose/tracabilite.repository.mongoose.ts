import mongoose from "mongoose";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type { TraceabiliteRepository } from "../../domain/ports";
import type {
  OperationResume,
  Traceabilite,
  TraceabiliteSaisie,
} from "../../domain/tracabilite";
import { TraceabiliteModel } from "./tracabilite.model";

interface DocumentTraceabilite {
  _id: unknown;
  operationId: unknown;
  identifiantSuivi: string;
  typeDechet: string;
  volume: number;
  unite: Traceabilite["unite"];
  traitement: string;
  creePar: unknown;
  modifiePar: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface DocumentOperation {
  _id: unknown;
  natureIntervention: string;
  dateHeurePrevue: Date;
  clientId?: unknown;
  siteId?: unknown;
}

interface DocumentReference {
  _id: unknown;
  nom?: string;
}

function referenceId(value: unknown): string {
  if (value && typeof value === "object" && "_id" in value) {
    return String((value as { _id: unknown })._id);
  }
  return String(value ?? "");
}

function operationResume(value: unknown): OperationResume | null | undefined {
  if (value == null) return value;
  if (typeof value !== "object" || !("_id" in value)) return undefined;
  const operation = value as DocumentOperation;
  const client = operation.clientId as DocumentReference | null | undefined;
  const site = operation.siteId as DocumentReference | null | undefined;
  return {
    id: String(operation._id),
    natureIntervention: operation.natureIntervention,
    dateHeurePrevue: operation.dateHeurePrevue,
    client: client ? { id: referenceId(client), nom: client.nom ?? "" } : null,
    site: site ? { id: referenceId(site), nom: site.nom ?? "" } : null,
  };
}

function versEntite(doc: DocumentTraceabilite): Traceabilite {
  const entite: Traceabilite = {
    id: String(doc._id),
    operationId: referenceId(doc.operationId),
    identifiantSuivi: doc.identifiantSuivi,
    typeDechet: doc.typeDechet,
    volume: doc.volume,
    unite: doc.unite,
    traitement: doc.traitement,
    creePar: referenceId(doc.creePar),
    modifiePar: referenceId(doc.modifiePar),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
  const operation = operationResume(doc.operationId);
  if (operation !== undefined) entite.operation = operation;
  return entite;
}

const PEUPLEMENT_OPERATION = {
  path: "operationId",
  select: "natureIntervention dateHeurePrevue clientId siteId",
  populate: [
    { path: "clientId", select: "nom" },
    { path: "siteId", select: "nom" },
  ],
};

export class TraceabiliteRepositoryMongoose implements TraceabiliteRepository {
  async lister(operationId?: string): Promise<Traceabilite[]> {
    await connectDB();
    const filtre = operationId ? { operationId } : {};
    const documents = (await TraceabiliteModel.find(filtre)
      .populate(PEUPLEMENT_OPERATION)
      .sort({ createdAt: -1 })
      .lean()
      .exec()) as unknown as DocumentTraceabilite[];
    return documents.map(versEntite);
  }

  async trouverParId(id: string): Promise<Traceabilite | null> {
    await connectDB();
    const document = (await TraceabiliteModel.findById(id)
      .lean()
      .exec()) as unknown as DocumentTraceabilite | null;
    return document ? versEntite(document) : null;
  }

  async creer(
    operationId: string,
    saisie: TraceabiliteSaisie,
    acteurId: string
  ): Promise<Traceabilite> {
    await connectDB();
    const document = await TraceabiliteModel.create({
      ...saisie,
      operationId: new mongoose.Types.ObjectId(operationId),
      creePar: new mongoose.Types.ObjectId(acteurId),
      modifiePar: new mongoose.Types.ObjectId(acteurId),
    });
    return versEntite(document.toObject() as DocumentTraceabilite);
  }

  async modifier(
    id: string,
    saisie: TraceabiliteSaisie,
    acteurId: string
  ): Promise<Traceabilite | null> {
    await connectDB();
    const document = (await TraceabiliteModel.findByIdAndUpdate(
      id,
      { ...saisie, modifiePar: new mongoose.Types.ObjectId(acteurId) },
      { new: true, runValidators: true }
    )
      .lean()
      .exec()) as unknown as DocumentTraceabilite | null;
    return document ? versEntite(document) : null;
  }

}
