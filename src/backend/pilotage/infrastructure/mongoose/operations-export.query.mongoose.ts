import mongoose from "mongoose";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type { OperationStatus } from "@/shared/operations/statuts";
import type { QuantiteUnite } from "@/shared/operations/quantites";
import type { OperationAExporter } from "../../domain/export-csv";

export const MAX_OPERATIONS_EXPORT = 5000;

interface OperationExportDocument {
  _id: unknown;
  clientId?: { nom?: string } | null;
  siteId?: { nom?: string } | null;
  natureIntervention: string;
  dateHeurePrevue: Date;
  statut: OperationStatus;
  quantiteCollectee?: number;
  uniteQuantite?: QuantiteUnite;
}

export class OperationsExportQueryMongoose {
  async exporter(debut: Date, fin: Date): Promise<OperationAExporter[]> {
    await connectDB();
    const documents = (await mongoose
      .model("Operation")
      .find({ dateHeurePrevue: { $gte: debut, $lte: fin } })
      .sort({ dateHeurePrevue: 1, _id: 1 })
      .limit(MAX_OPERATIONS_EXPORT + 1)
      .select("clientId siteId natureIntervention dateHeurePrevue statut quantiteCollectee uniteQuantite")
      .populate("clientId", "nom")
      .populate("siteId", "nom")
      .lean()) as unknown as OperationExportDocument[];

    return documents.map((operation) => ({
      id: String(operation._id),
      client: operation.clientId?.nom ?? "",
      site: operation.siteId?.nom ?? "",
      natureIntervention: operation.natureIntervention,
      dateHeurePrevue: new Date(operation.dateHeurePrevue),
      statut: operation.statut,
      quantiteCollectee: operation.quantiteCollectee,
      uniteQuantite: operation.uniteQuantite,
    }));
  }
}
