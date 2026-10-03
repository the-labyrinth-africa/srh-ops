import type { FiltreRecurrences, Recurrence, RecurrencePlanifiable, RecurrenceSaisie } from "./recurrence";

export interface RecurrenceRepository {
  /** Relations peuplées, triées par date de création décroissante. */
  lister(filtre: FiltreRecurrences): Promise<Recurrence[]>;
  /** Relations peuplées ; null si la récurrence n'existe pas. */
  trouverParId(id: string): Promise<Recurrence | null>;
  /** Relations peuplées. */
  creer(saisie: RecurrenceSaisie): Promise<Recurrence>;
  /** Les clés absentes de la saisie ne sont pas modifiées ; null si la récurrence n'existe pas. */
  modifier(id: string, saisie: RecurrenceSaisie): Promise<Recurrence | null>;
  /** false si la récurrence n'existait pas. */
  supprimer(id: string): Promise<boolean>;
  /** Récurrences actives, relations non peuplées. */
  listerActives(): Promise<RecurrencePlanifiable[]>;
  /** Enregistre la date de la dernière occurrence réellement créée. */
  avancerAncre(id: string, derniereGeneration: Date): Promise<void>;
}

/** Opération à créer pour une occurrence de récurrence. */
export interface OccurrenceACreer {
  clientId: string;
  siteId: string;
  natureIntervention: string;
  dateHeurePrevue: Date;
  dureeEstimeeMinutes: number;
  equipeId?: string;
  vehiculeId?: string;
  equipementIds: string[];
  informationsParticulieres: string;
}

export interface ConflitDetecte {
  hasConflict: boolean;
  message?: string;
}

/** Ce que `recurrences` demande au domaine `operations` (par son API publique). */
export interface OperationsRecurrentes {
  /** Une opération existe déjà pour ce client, ce site et cette date exacte. */
  existeSurCreneau(clientId: string, siteId: string, dateHeurePrevue: Date): Promise<boolean>;
  verifierConflits(demande: {
    dateHeurePrevue: Date;
    dureeEstimeeMinutes: number;
    equipeId?: string;
    vehiculeId?: string;
  }): Promise<ConflitDetecte[]>;
  /** Crée l'opération (statut initial et historique posés par `operations`). */
  creer(occurrence: OccurrenceACreer, parUtilisateur: string): Promise<void>;
}

/** Port local, structurellement compatible avec `SystemClock` de `platform/horloge`. */
export interface Horloge {
  maintenant(): Date;
}
