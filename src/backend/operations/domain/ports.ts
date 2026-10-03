import type { AffectationExistante, ConflictResult, DemandeAffectation } from "./conflits";
import type { FiltreOperations, Operation, OperationSaisie, Pagination, StatutInitial } from "./operation";

export interface CritereAffectations {
  /** Borne haute exclusive : seules les opérations qui démarrent avant cet instant. */
  debutAvant: Date;
  equipeId?: string;
  vehiculeId?: string;
  exclureOperationId?: string;
}

export interface Affectations {
  /**
   * Opérations qui retiennent encore une ressource (hors `STATUTS_SANS_CONFLIT`), affectées à
   * l'équipe OU au véhicule demandés, démarrant avant `debutAvant`. Pas de borne basse : une
   * opération longue démarrée bien avant peut encore chevaucher (le chevauchement exact est
   * testé par `detecterConflits`). Sans équipe ni véhicule : aucune candidate.
   */
  candidates(critere: CritereAffectations): Promise<AffectationExistante[]>;
}

export interface OperationRepository {
  /** Niveau « liste » (site avec adresse), triées par date prévue décroissante ; `total` ignore la pagination. */
  lister(filtre: FiltreOperations, pagination: Pagination): Promise<{ items: Operation[]; total: number }>;
  /** Niveau « résumé », sans tri. */
  listerPourPlanning(filtre: FiltreOperations): Promise<Operation[]>;
  /** Niveau « détail » (toutes les relations peuplées) ; null si l'opération n'existe pas. */
  trouverDetailParId(id: string): Promise<Operation | null>;
  /** Le `statut` de la saisie est remplacé par `initial.statut` ; niveau « résumé ». */
  creer(saisie: OperationSaisie, initial: StatutInitial): Promise<Operation>;
  /** Les clés absentes de la saisie ne sont pas modifiées ; null si l'opération n'existe pas ; niveau « résumé ». */
  modifier(id: string, saisie: OperationSaisie): Promise<Operation | null>;
  /** false si l'opération n'existait pas. */
  supprimer(id: string): Promise<boolean>;
}

/** Détection des conflits d'affectation (cas d'usage de R4a, injecté). */
export type VerificationConflits = (demande: DemandeAffectation) => Promise<ConflictResult[]>;

/** Port local, structurellement compatible avec `SystemClock` de `platform/horloge`. */
export interface Horloge {
  maintenant(): Date;
}
