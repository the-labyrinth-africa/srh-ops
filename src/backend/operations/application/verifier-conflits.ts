import {
  detecterConflits,
  fenetreDemandee,
  type ConflictResult,
  type DemandeAffectation,
} from "../domain/conflits";
import type { Affectations } from "../domain/ports";

export function creerVerificationConflits(deps: { affectations: Affectations }) {
  return async function checkAssignmentConflicts(demande: DemandeAffectation): Promise<ConflictResult[]> {
    const { equipeId, vehiculeId, excludeOperationId } = demande;
    if (!equipeId && !vehiculeId) return [];

    const existantes = await deps.affectations.candidates({
      debutAvant: fenetreDemandee(demande).fin,
      equipeId,
      vehiculeId,
      exclureOperationId: excludeOperationId,
    });

    return detecterConflits(demande, existantes);
  };
}
