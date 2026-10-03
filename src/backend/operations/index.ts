// API publique du domaine `operations` pour les autres domaines et pour `src/app`.
export { computeEffectiveStatus } from "./domain/statut-effectif";
export { checkAssignmentConflicts } from "./composition";
export type { ConflictResult, DemandeAffectation } from "./domain/conflits";
