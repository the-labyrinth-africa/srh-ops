import type { RecurrenceFrequency } from "@/shared/recurrences/frequence";

/**
 * Relation vers un autre document : peuplée, identifiant brut (relation non peuplée), ou `null`
 * (le document référencé n'existe plus).
 */
export type Reference<T> = T | string | null;

export interface ClientPeuple {
  id: string;
  nom?: string;
}

export interface SitePeuple {
  id: string;
  nom?: string;
  adresse?: string;
}

export interface EquipePeuplee {
  id: string;
  nom?: string;
}

export interface VehiculePeuple {
  id: string;
  identification?: string;
}

export interface EquipementPeuple {
  id: string;
  nom?: string;
}

/** Configuration d'une collecte récurrente, telle que la présentent les routes (relations peuplées). */
export interface Recurrence {
  id: string;
  clientId: Reference<ClientPeuple>;
  siteId: Reference<SitePeuple>;
  natureIntervention: string;
  frequence: RecurrenceFrequency;
  /** 0 = dimanche … 6 = samedi (fréquence hebdomadaire). */
  jourSemaine?: number;
  /** 1 à 31 (fréquence mensuelle). */
  jourMois?: number;
  /** Nombre de jours entre deux passages (fréquence personnalisée). */
  intervalleJours?: number;
  /** « HH:mm », heure locale. */
  heurePrevue: string;
  dureeEstimeeMinutes: number;
  equipeId?: Reference<EquipePeuplee>;
  vehiculeId?: Reference<VehiculePeuple>;
  equipementIds: (string | EquipementPeuple)[];
  informationsParticulieres: string;
  active: boolean;
  /** Date de la dernière occurrence réellement créée (ancre des récurrences personnalisées). */
  derniereGeneration?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  revision?: number;
}

/**
 * Sortie validée du formulaire. Les clés facultatives sont absentes quand le formulaire ne les
 * fournit pas : à la modification, une clé absente laisse la valeur stockée intacte.
 */
export interface RecurrenceSaisie {
  clientId: string;
  siteId: string;
  natureIntervention: string;
  frequence: RecurrenceFrequency;
  jourSemaine?: number;
  jourMois?: number;
  intervalleJours?: number;
  heurePrevue: string;
  dureeEstimeeMinutes: number;
  equipeId?: string;
  vehiculeId?: string;
  equipementIds: string[];
  informationsParticulieres: string;
  active: boolean;
}

/** Filtres transmis tels quels au dépôt (aucune validation : comportement historique). */
export interface FiltreRecurrences {
  clientId?: string;
  siteId?: string;
  frequence?: string;
  active?: boolean;
}

/** Récurrence active, relations non peuplées : ce qu'il faut pour calculer et créer ses occurrences. */
export interface RecurrencePlanifiable {
  id: string;
  clientId: string;
  siteId: string;
  natureIntervention: string;
  frequence: RecurrenceFrequency;
  jourSemaine?: number;
  jourMois?: number;
  intervalleJours?: number;
  heurePrevue?: string;
  dureeEstimeeMinutes?: number;
  equipeId?: string;
  vehiculeId?: string;
  equipementIds?: string[];
  informationsParticulieres?: string;
  derniereGeneration?: Date;
  createdAt: Date;
}
