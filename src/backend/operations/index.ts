// API publique du domaine `operations` pour les autres domaines et pour `src/app`.
export { computeEffectiveStatus } from "./domain/statut-effectif";
export { checkAssignmentConflicts, existeOperationSurCreneau, creerOperationPlanifiee } from "./composition";
export type { ConflictResult, DemandeAffectation } from "./domain/conflits";
export type { OccurrencePlanifiee } from "./domain/operation";
