import { TERMINAL_STATUSES, type OperationStatus } from "@/shared/operations/statuts";

/**
 * Statut à afficher : une opération non terminale dont la date prévue est dépassée
 * est présentée « Retardée » sans que la base soit modifiée (calcul à l'affichage).
 */
export function computeEffectiveStatus(
  statut: OperationStatus,
  dateHeurePrevue: Date,
  maintenant: Date = new Date()
): OperationStatus {
  if (TERMINAL_STATUSES.includes(statut)) return statut;
  if (dateHeurePrevue < maintenant && statut !== "Retardée") {
    return "Retardée";
  }
  return statut;
}
