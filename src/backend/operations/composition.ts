import { SystemClock } from "@/backend/platform/horloge/horloge";
import { creerCasDUsageOperations } from "./application/cas-d-usage";
import { creerCasDUsageRapport } from "./application/cas-d-usage-rapport";
import { creerCasDUsageTerrain } from "./application/cas-d-usage-terrain";
import { creerVerificationConflits } from "./application/verifier-conflits";
import type { OccurrencePlanifiee } from "./domain/operation";
import { AffectationsMongoose } from "./infrastructure/mongoose/affectations.mongoose";
import { OperationRepositoryMongoose } from "./infrastructure/mongoose/operation.repository.mongoose";
import { GenerateurRapportJsPdf } from "./infrastructure/pdf/generateur-rapport.jspdf";

const operations = new OperationRepositoryMongoose();
const horloge = new SystemClock();

export const checkAssignmentConflicts = creerVerificationConflits({
  affectations: new AffectationsMongoose(),
});

export const casDUsageOperations = creerCasDUsageOperations({
  operations,
  verifierConflits: checkAssignmentConflicts,
  horloge,
});

export const casDUsageTerrain = creerCasDUsageTerrain({
  operations,
  horloge,
  // Fonction (et non alias direct de `console.warn`) : relit `console.warn` à chaque appel, donc
  // reste observable par un test qui l'espionne après le chargement du module (leçon R3b).
  alerteCoherence: (message) => console.warn(message),
});

export const casDUsageRapport = creerCasDUsageRapport({
  obtenir: casDUsageOperations.obtenir,
  generateur: new GenerateurRapportJsPdf(),
  horloge,
});

// Capacités ciblées exposées aux autres domaines par `index.ts` (jamais le dépôt ni le modèle).

/** Une opération existe déjà pour ce client, ce site et cette date exacte. */
export function existeOperationSurCreneau(clientId: string, siteId: string, dateHeurePrevue: Date): Promise<boolean> {
  return casDUsageOperations.existeSurCreneau(clientId, siteId, dateHeurePrevue);
}

/** Crée une opération planifiée par un autre domaine ; `parUtilisateur` signe la première entrée d'historique. */
export async function creerOperationPlanifiee(occurrence: OccurrencePlanifiee, parUtilisateur: string): Promise<void> {
  await casDUsageOperations.creerPlanifiee(parUtilisateur, occurrence);
}
