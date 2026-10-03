import type { OperationStatus } from "@/shared/operations/statuts";

export const DUREE_PAR_DEFAUT_MINUTES = 120;

/** Une opération dans l'un de ces statuts ne retient plus ni équipe ni véhicule. */
export const STATUTS_SANS_CONFLIT: OperationStatus[] = ["Annulée", "Terminée", "Rapportée"];

/** Forme renvoyée telle quelle dans le corps du 409 : ne pas renommer les champs. */
export interface ConflictResult {
  hasConflict: boolean;
  message?: string;
  conflictingOperationId?: string;
}

export interface DemandeAffectation {
  dateHeurePrevue: Date;
  dureeEstimeeMinutes?: number;
  equipeId?: string;
  vehiculeId?: string;
  excludeOperationId?: string;
}

/** Ce qu'il faut savoir d'une opération existante pour tester un chevauchement. */
export interface AffectationExistante {
  operationId: string;
  dateHeurePrevue: Date;
  dureeEstimeeMinutes?: number | null;
  equipeId?: string;
  vehiculeId?: string;
}

export function finPrevue(debut: Date, dureeMinutes: number): Date {
  return new Date(debut.getTime() + dureeMinutes * 60 * 1000);
}

export function fenetreDemandee(demande: DemandeAffectation): { debut: Date; fin: Date } {
  const { dateHeurePrevue, dureeEstimeeMinutes = DUREE_PAR_DEFAUT_MINUTES } = demande;
  return { debut: dateHeurePrevue, fin: finPrevue(dateHeurePrevue, dureeEstimeeMinutes) };
}

export function seChevauchent(debutA: Date, finA: Date, debutB: Date, finB: Date): boolean {
  return debutA < finB && finA > debutB;
}

/**
 * Une entrée par ressource partagée et par opération candidate qui chevauche le créneau
 * demandé, dans l'ordre des candidates ; pour une même opération, l'équipe avant le véhicule.
 */
export function detecterConflits(
  demande: DemandeAffectation,
  existantes: AffectationExistante[]
): ConflictResult[] {
  const { equipeId, vehiculeId } = demande;
  const { debut, fin } = fenetreDemandee(demande);
  const conflits: ConflictResult[] = [];

  for (const existante of existantes) {
    const debutExistante = existante.dateHeurePrevue;
    const finExistante = finPrevue(
      debutExistante,
      existante.dureeEstimeeMinutes ?? DUREE_PAR_DEFAUT_MINUTES
    );

    if (!seChevauchent(debut, fin, debutExistante, finExistante)) continue;

    if (equipeId && existante.equipeId === equipeId) {
      conflits.push({
        hasConflict: true,
        message: "L'équipe est déjà affectée à une opération sur ce créneau",
        conflictingOperationId: existante.operationId,
      });
    }
    if (vehiculeId && existante.vehiculeId === vehiculeId) {
      conflits.push({
        hasConflict: true,
        message: "Le véhicule est déjà affecté à une opération sur ce créneau",
        conflictingOperationId: existante.operationId,
      });
    }
  }

  return conflits;
}
