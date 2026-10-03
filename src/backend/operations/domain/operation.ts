import type { OperationStatus } from "@/shared/operations/statuts";
import type { QuantiteUnite } from "@/shared/operations/quantites";

/**
 * Relation vers un autre document : peuplée (les champs présents dépendent de la route),
 * identifiant brut (relation non peuplée), ou `null` (le document référencé n'existe plus).
 */
export type Reference<T> = T | string | null;

export interface ClientPeuple {
  id: string;
  nom?: string;
  contact?: { telephone?: string; email?: string };
}

export interface SitePeuple {
  id: string;
  nom?: string;
  adresse?: string;
  typeDechets?: string[];
}

export interface EquipePeuplee {
  id: string;
  nom?: string;
  membres?: string[];
}

export interface VehiculePeuple {
  id: string;
  identification?: string;
  type?: string;
}

export interface EquipementPeuple {
  id: string;
  nom?: string;
  type?: string;
}

export interface UtilisateurPeuple {
  id: string;
  nom?: string;
}

export interface EntreeHistorique {
  statut: OperationStatus;
  date: Date;
  parUtilisateur?: Reference<UtilisateurPeuple>;
  ancienStatut?: OperationStatus;
}

export interface PhotoOperation {
  url: string;
  nom: string;
  uploadedAt: Date;
}

export interface Operation {
  id: string;
  clientId: Reference<ClientPeuple>;
  siteId: Reference<SitePeuple>;
  natureIntervention: string;
  dateHeurePrevue: Date;
  dureeEstimeeMinutes: number;
  /** Absent : jamais affectée. `null` : l'équipe référencée a été supprimée. */
  equipeId?: Reference<EquipePeuplee>;
  vehiculeId?: Reference<VehiculePeuple>;
  equipementIds: (string | EquipementPeuple)[];
  informationsParticulieres: string;
  statut: OperationStatus;
  historiqueStatuts: EntreeHistorique[];
  quantiteCollectee?: number;
  uniteQuantite: QuantiteUnite;
  remarquesTerrain: string;
  nomSignataireClient: string;
  signatureClient: string;
  photos: PhotoOperation[];
  rapportPdf: string;
  createdAt?: Date;
  updatedAt?: Date;
  revision?: number;
}

/**
 * Sortie validée du formulaire d'opération. Les clés facultatives sont **absentes** (jamais
 * `undefined` explicite) quand le formulaire ne les fournit pas : à la modification, une clé
 * absente laisse la valeur stockée intacte.
 */
export interface OperationSaisie {
  clientId: string;
  siteId: string;
  natureIntervention: string;
  dateHeurePrevue: Date;
  dureeEstimeeMinutes: number;
  equipeId?: string;
  vehiculeId?: string;
  equipementIds: string[];
  informationsParticulieres: string;
  /** Ignoré à la création (statut initial calculé) ; appliqué tel quel à la modification. */
  statut?: OperationStatus;
  quantiteCollectee?: number;
  uniteQuantite: QuantiteUnite;
  remarquesTerrain: string;
  nomSignataireClient: string;
  signatureClient: string;
}

/** Première entrée de l'historique, posée à la création. */
export interface StatutInitial {
  statut: OperationStatus;
  date: Date;
  parUtilisateur: string;
}

/** Filtres transmis tels quels au dépôt (aucune validation : comportement historique). */
export interface FiltreOperations {
  clientId?: string;
  siteId?: string;
  equipeId?: string;
  vehiculeId?: string;
  statut?: string;
  /** Borne basse incluse. */
  dateDebut?: Date;
  /** Borne haute incluse. */
  dateFin?: Date;
}

export interface Pagination {
  skip: number;
  limit: number;
}

/** Identifiant porté par une relation, qu'elle soit peuplée ou non ; `null`/`undefined` conservés. */
export function idDeReference(reference: Reference<{ id: string }> | undefined): string | null | undefined {
  if (reference == null) return reference;
  return typeof reference === "string" ? reference : reference.id;
}
