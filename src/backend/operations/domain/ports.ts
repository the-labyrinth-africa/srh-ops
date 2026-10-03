import type { AffectationExistante } from "./conflits";

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
