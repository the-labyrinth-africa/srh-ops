import { verifierAccesOperation } from "@/backend/operations";
import { creerCasDUsageTracabilite } from "./application/cas-d-usage";
import { TraceabiliteAccesRefuse, TraceabiliteIntrouvable } from "./domain/erreurs";
import { TraceabiliteRepositoryMongoose } from "./infrastructure/mongoose/tracabilite.repository.mongoose";

export const casDUsageTracabilite = creerCasDUsageTracabilite({
  tracabilites: new TraceabiliteRepositoryMongoose(),
  verifierAccesOperation: async (acteur, operationId) => {
    const resultat = await verifierAccesOperation(acteur, operationId);
    if (resultat === "not-found") throw new TraceabiliteIntrouvable();
    if (resultat === "forbidden") {
      throw new TraceabiliteAccesRefuse();
    }
  },
});
