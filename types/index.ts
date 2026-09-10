export type UserRole = "admin" | "dispatcher" | "lecture";

export type OperationStatus =
  | "Planifiée"
  | "Affectée"
  | "En route"
  | "En cours"
  | "Terminée"
  | "Rapportée"
  | "Retardée"
  | "Annulée";

export const OPERATION_STATUSES: OperationStatus[] = [
  "Planifiée",
  "Affectée",
  "En route",
  "En cours",
  "Terminée",
  "Rapportée",
  "Retardée",
  "Annulée",
];

export const TERMINAL_STATUSES: OperationStatus[] = [
  "Terminée",
  "Rapportée",
  "Annulée",
];

export interface StatusHistoryEntry {
  statut: OperationStatus;
  date: string;
  parUtilisateur?: string;
  ancienStatut?: OperationStatus;
}
