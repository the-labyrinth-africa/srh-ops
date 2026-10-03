import mongoose from "mongoose";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type { OperationStatus } from "@/shared/operations/statuts";
import type { StatistiquesQuery } from "../../domain/ports";
import type { OperationDuJour, OperationSuivie } from "../../domain/statistiques";

/**
 * Modèle de lecture : requêtes directes, en lecture seule, sur les collections des opérations,
 * des clients et des sites. Les modèles sont récupérés par leur nom dans le registre Mongoose
 * (rempli par `connectDB()`), sans importer les modèles des autres domaines.
 */
export class StatistiquesQueryMongoose implements StatistiquesQuery {
  async operationsSuivies(): Promise<OperationSuivie[]> {
    await connectDB();
    // Seuls les champs utiles : inutile de charger les photos de toutes les opérations.
    const docs = (await mongoose
      .model("Operation")
      .find()
      .select("natureIntervention dateHeurePrevue statut")
      .lean()) as unknown as { _id: unknown; natureIntervention: string; dateHeurePrevue: Date; statut: OperationStatus }[];
    return docs.map((doc) => ({
      id: String(doc._id),
      natureIntervention: doc.natureIntervention,
      dateHeurePrevue: doc.dateHeurePrevue,
      statut: doc.statut,
    }));
  }

  async compterClientsEtSites(): Promise<{ totalClients: number; totalSites: number }> {
    await connectDB();
    const [totalClients, totalSites] = await Promise.all([
      mongoose.model("Client").countDocuments(),
      mongoose.model("Site").countDocuments(),
    ]);
    return { totalClients, totalSites };
  }

  async operationsDuJour(debut: Date, fin: Date, { avecEquipe }: { avecEquipe: boolean }): Promise<OperationDuJour[]> {
    await connectDB();
    let requete = mongoose
      .model("Operation")
      .find({ dateHeurePrevue: { $gte: debut, $lte: fin } })
      .populate("clientId", "nom")
      .populate("siteId", "nom");
    if (avecEquipe) requete = requete.populate("equipeId", "nom");
    return (await requete.sort({ dateHeurePrevue: 1 }).lean()) as unknown as OperationDuJour[];
  }
}
