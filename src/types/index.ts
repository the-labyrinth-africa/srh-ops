export type UserRole = "admin" | "dispatcher" | "chauffeur" | "client" | "lecture";

export const USER_ROLES: UserRole[] = [
  "admin",
  "dispatcher",
  "chauffeur",
  "client",
  "lecture",
];

export type QuantiteUnite = "Litres" | "Kg" | "M3" | "Bacs";

export const QUANTITE_UNITES: QuantiteUnite[] = ["Litres", "Kg", "M3", "Bacs"];

export interface IUser {
  _id: string;
  username: string;
  nom: string;
  email: string;
  role: UserRole;
  telephone?: string;
  clientId?: string;
  equipeId?: string;
  mustChangePassword?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

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

export type RecurrenceFrequency =
  | "hebdomadaire"
  | "mensuelle"
  | "personnalisee";


