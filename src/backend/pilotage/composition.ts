import { SystemClock } from "@/backend/platform/horloge/horloge";
import { creerCasDUsagePilotage } from "./application/cas-d-usage";
import { StatistiquesQueryMongoose } from "./infrastructure/mongoose/statistiques.query.mongoose";

export const casDUsagePilotage = creerCasDUsagePilotage({
  statistiques: new StatistiquesQueryMongoose(),
  horloge: new SystemClock(),
});

/** Données de la page d'accueil de la direction (exposées à `src/app` par `index.ts`). */
export function tableauDeBordDirection() {
  return casDUsagePilotage.tableauDeBord();
}
