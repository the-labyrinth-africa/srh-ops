export type OperationStatus =
  | "Planifiée"
  | "Affectée"
  | "En route"
  | "En cours"
  | "Terminée"
  | "Rapportée"
  | "Retardée"
  | "Annulée";

export const OPERATION_STATUSES = [
  "Planifiée",
  "Affectée",
  "En route",
  "En cours",
  "Terminée",
  "Rapportée",
  "Retardée",
  "Annulée",
] as const satisfies readonly OperationStatus[];

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
