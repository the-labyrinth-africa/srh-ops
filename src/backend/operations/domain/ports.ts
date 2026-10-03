import type { AffectationExistante, ConflictResult, DemandeAffectation } from "./conflits";
import type { ChangementStatut, EtatTerrain } from "./changement-statut";
import type { FiltreOperations, Operation, OperationRealisee, OperationSaisie, Pagination, PhotoOperation, StatutInitial } from "./operation";

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
  /** Une opération existe pour ce client, ce site et cette date exacte (quel que soit son statut). */
  existeSurCreneau(clientId: string, siteId: string, dateHeurePrevue: Date): Promise<boolean>;
  /** Une opération existe pour ce site, cette date exacte et cette quantité collectée. */
  existeCollecte(siteId: string, dateHeurePrevue: Date, quantiteCollectee: number): Promise<boolean>;
  /** Enregistre une collecte déjà réalisée, telle quelle (aucune photo). */
  creerRealisee(collecte: OperationRealisee): Promise<void>;
  /** État brut (relations non peuplées) nécessaire aux écritures de terrain ; null si l'opération n'existe pas. */
  trouverEtatTerrain(id: string): Promise<EtatTerrain | null>;
  /**
   * Applique le statut, les données de terrain fournies et ajoute l'entrée d'historique en un seul
   * enregistrement ; niveau « terrain » (site avec adresse, équipements avec nom) ; null si absente.
   */
  changerStatut(id: string, changement: ChangementStatut): Promise<Operation | null>;
  /** Ajoute la photo à la suite ; false si l'opération n'existe pas. */
  ajouterPhoto(id: string, photo: PhotoOperation): Promise<boolean>;
  /** Retire toutes les photos portant cette URL (aucune : sans effet) ; false si l'opération n'existe pas. */
  retirerPhotos(id: string, url: string): Promise<boolean>;
}

/** Détection des conflits d'affectation (cas d'usage de R4a, injecté). */
export type VerificationConflits = (demande: DemandeAffectation) => Promise<ConflictResult[]>;

/** Port local, structurellement compatible avec `SystemClock` de `platform/horloge`. */
export interface Horloge {
  maintenant(): Date;
}

/** Signalement non bloquant d'une incohérence métier (journal). */
export type AlerteCoherence = (message: string) => void;

/** Mise en page du rapport d'intervention ; renvoie les octets du PDF. */
export interface GenerateurRapportPdf {
  generer(operation: Operation, genereLe: Date): Promise<Uint8Array>;
}
