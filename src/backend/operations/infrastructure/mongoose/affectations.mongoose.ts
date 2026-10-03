import mongoose from "mongoose";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
// Modèle encore hérité : il rejoindra `./operation.model` au sous-jalon 4b.
import { Operation } from "@/models/Operation";
import { STATUTS_SANS_CONFLIT, type AffectationExistante } from "../../domain/conflits";
import type { Affectations, CritereAffectations } from "../../domain/ports";

interface DocumentAffectation {
  _id: unknown;
  dateHeurePrevue: Date;
  dureeEstimeeMinutes?: number | null;
  equipeId?: { toString(): string } | null;
  vehiculeId?: { toString(): string } | null;
}

export class AffectationsMongoose implements Affectations {
  async candidates(critere: CritereAffectations): Promise<AffectationExistante[]> {
    const { debutAvant, equipeId, vehiculeId, exclureOperationId } = critere;

    const ressources: Record<string, unknown>[] = [];
    if (equipeId) {
      ressources.push({ equipeId: new mongoose.Types.ObjectId(equipeId) });
    }
    if (vehiculeId) {
      ressources.push({ vehiculeId: new mongoose.Types.ObjectId(vehiculeId) });
    }
    if (ressources.length === 0) return [];

    const filtre: Record<string, unknown> = {
      statut: { $nin: STATUTS_SANS_CONFLIT },
      dateHeurePrevue: { $lt: debutAvant },
      $or: ressources,
    };
    if (exclureOperationId) {
      filtre._id = { $ne: new mongoose.Types.ObjectId(exclureOperationId) };
    }

    await connectDB();
    const documents = (await Operation.find(filtre).lean()) as unknown as DocumentAffectation[];

    return documents.map((doc) => ({
      operationId: String(doc._id),
      dateHeurePrevue: new Date(doc.dateHeurePrevue),
      dureeEstimeeMinutes: doc.dureeEstimeeMinutes,
      equipeId: doc.equipeId?.toString(),
      vehiculeId: doc.vehiculeId?.toString(),
    }));
  }
}
