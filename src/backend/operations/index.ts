// API publique du domaine `operations` pour les autres domaines et pour `src/app`.
export { computeEffectiveStatus } from "@/shared/operations/statut-effectif";
export {
  checkAssignmentConflicts,
  existeOperationSurCreneau,
  creerOperationPlanifiee,
  existeOperationCollectee,
  enregistrerOperationRealisee,
} from "./composition";
export type { ConflictResult, DemandeAffectation } from "./domain/conflits";
export type { OccurrencePlanifiee, OperationRealisee } from "./domain/operation";
