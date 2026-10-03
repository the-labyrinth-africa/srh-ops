import type { OperationStatus } from "@/shared/operations/statuts";
import type { LectureClasseur } from "./lecture";

export interface LecteurExcel {
  lire(contenu: Uint8Array, nomFichier: string): Promise<LectureClasseur>;
}

/** Ce que l'import demande au domaine `clients-sites` (par son API publique). */
export interface SitesDuClient {
  /** Identifiant canonique du client, ou null s'il n'existe pas. */
  identifiantDuClient(clientId: string): Promise<string | null>;
  /** Site du client portant exactement ce nom (casse ignorée), ou null. Jamais un site d'un autre client. */
  trouverParNom(clientId: string, nom: string): Promise<string | null>;
  /** Crée le site et renvoie son identifiant. */
  creer(site: {
    clientId: string;
    nom: string;
    adresse: string;
    localisation: { lat: number; lng: number };
    typeDechets: string[];
    observations: string;
  }): Promise<string>;
}

export interface CollecteImportee {
  clientId: string;
  siteId: string;
  natureIntervention: string;
  dateHeurePrevue: Date;
  dureeEstimeeMinutes: number;
  informationsParticulieres: string;
  statut: OperationStatus;
  historiqueStatuts: { statut: OperationStatus; date: Date }[];
  quantiteCollectee: number;
  uniteQuantite: "Litres";
  remarquesTerrain: string;
}

/** Ce que l'import demande au domaine `operations` (par son API publique). */
export interface CollectesRealisees {
  /** Une opération existe déjà pour ce site, cette date exacte et cette quantité. */
  existe(siteId: string, dateHeurePrevue: Date, quantiteCollectee: number): Promise<boolean>;
  enregistrer(collecte: CollecteImportee): Promise<void>;
}
