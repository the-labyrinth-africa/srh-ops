import type { OperationStatus } from "@/shared/operations/statuts";
import { STATUTS_SANS_CONFLIT, type AffectationExistante } from "../../domain/conflits";
import type { Affectations, CritereAffectations } from "../../domain/ports";

export type AffectationEnregistree = AffectationExistante & { statut: OperationStatus };

export class AffectationsEnMemoire implements Affectations {
  /** Critères reçus, dans l'ordre des appels (pour les assertions des tests). */
  readonly appels: CritereAffectations[] = [];

  constructor(private readonly operations: AffectationEnregistree[] = []) {}

  async candidates(critere: CritereAffectations): Promise<AffectationExistante[]> {
    this.appels.push(critere);
    const { debutAvant, equipeId, vehiculeId, exclureOperationId } = critere;
    if (!equipeId && !vehiculeId) return [];
    return this.operations
      .filter((op) => !STATUTS_SANS_CONFLIT.includes(op.statut))
      .filter((op) => op.dateHeurePrevue < debutAvant)
      .filter((op) => (equipeId && op.equipeId === equipeId) || (vehiculeId && op.vehiculeId === vehiculeId))
      .filter((op) => op.operationId !== exclureOperationId)
      .map(({ operationId, dateHeurePrevue, dureeEstimeeMinutes, equipeId: equipe, vehiculeId: vehicule }) => ({
        operationId,
        dateHeurePrevue,
        dureeEstimeeMinutes,
        equipeId: equipe,
        vehiculeId: vehicule,
      }));
  }
}
