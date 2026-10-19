// API publique du domaine `operations` pour les autres domaines et pour `src/app`.
export { computeEffectiveStatus } from "@/shared/operations/statut-effectif";
export {
  checkAssignmentConflicts,
  existeOperationSurCreneau,
  creerOperationPlanifiee,
  creerOperationDemande,
  existeOperationCollectee,
  enregistrerOperationRealisee,
  verifierAccesOperation,
  listerOperationsPourActeur,
} from "./composition";
export type { Acteur } from "@/shared/acces/acteur";
export type { ConflictResult, DemandeAffectation } from "./domain/conflits";
export type { OccurrencePlanifiee, OperationRealisee } from "./domain/operation";
export type { FiltreOperations, OperationSaisie } from "./domain/operation";
