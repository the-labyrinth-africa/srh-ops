import type { OperationStatus } from "@/shared/operations/statuts";
import type { QuantiteUnite } from "@/shared/operations/quantites";

/** Données saisies sur le terrain ; une clé absente laisse la valeur stockée intacte. */
export interface DonneesTerrain {
  quantiteCollectee?: number;
  uniteQuantite?: QuantiteUnite;
  remarquesTerrain?: string;
  nomSignataireClient?: string;
  signatureClient?: string;
  /** Fourni : remplace toutes les photos de l'opération. */
  photos?: { url: string; nom?: string }[];
}

export interface DemandeChangementStatut extends DonneesTerrain {
  statut: OperationStatus;
}

/** Changement validé, prêt à être enregistré avec son entrée d'historique. */
export interface ChangementStatut extends DemandeChangementStatut {
  ancienStatut: OperationStatus;
  date: Date;
  parUtilisateur: string;
}

/** Ce qu'il faut savoir d'une opération pour autoriser une écriture de terrain. */
export interface EtatTerrain {
  statut: OperationStatus;
  /** Absent : jamais affectée. */
  equipeId?: string | null;
  photos: { url?: string }[];
}

/** Règle métier n°4 : une opération terminée sans être passée par « En cours » est signalée (non bloquant). */
export function terminaisonSansEnCours(ancien: OperationStatus, nouveau: OperationStatus): boolean {
  return nouveau === "Terminée" && ancien !== "En cours";
}

export function messageAlerteCoherence(operationId: string, ancien: OperationStatus): string {
  return `[cohérence] Opération ${operationId} passée Terminée sans En cours (était ${ancien})`;
}
