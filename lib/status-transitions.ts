import type { OperationStatus } from "@/types";

const ALLOWED_TRANSITIONS: Record<OperationStatus, OperationStatus[]> = {
  Planifiée: ["Affectée", "Annulée", "Retardée"],
  Affectée: ["En route", "Annulée", "Retardée"],
  "En route": ["En cours", "Retardée", "Annulée"],
  "En cours": ["Terminée", "Retardée", "Annulée"],
  Terminée: ["Rapportée"],
  Rapportée: [],
  Retardée: ["En route", "En cours", "Terminée", "Annulée"],
  Annulée: [],
};

export function canTransition(
  from: OperationStatus,
  to: OperationStatus
): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getNextStatuses(current: OperationStatus): OperationStatus[] {
  return ALLOWED_TRANSITIONS[current] ?? [];
}

export function computeEffectiveStatus(
  statut: OperationStatus,
  dateHeurePrevue: Date
): OperationStatus {
  if (TERMINAL.includes(statut)) return statut;
  if (dateHeurePrevue < new Date() && statut !== "Retardée") {
    return "Retardée";
  }
  return statut;
}

const TERMINAL: OperationStatus[] = ["Terminée", "Rapportée", "Annulée"];
