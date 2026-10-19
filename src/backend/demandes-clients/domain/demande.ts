import type { QuantiteUnite } from "@/shared/operations/quantites";

export type StatutDemandePublique = "en_attente" | "conversion_en_cours" | "convertie" | "refusee";

export interface DemandePublique {
  id: string;
  nomClient: string;
  nomContact: string;
  email: string;
  telephone: string;
  nomSite: string;
  adresseSite: string;
  natureIntervention: string;
  dateSouhaitee: Date;
  informationsParticulieres: string;
  statut: StatutDemandePublique;
  operationId?: string;
  clientId?: string;
  siteId?: string;
  traiteePar?: string;
  traiteeLe?: Date;
  motifRefus?: string;
  conversionCommenceeLe?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type DemandePubliqueSaisie = Omit<
  DemandePublique,
  | "id"
  | "statut"
  | "operationId"
  | "clientId"
  | "siteId"
  | "traiteePar"
  | "traiteeLe"
  | "motifRefus"
  | "conversionCommenceeLe"
  | "createdAt"
  | "updatedAt"
>;

export interface QualificationDemande {
  clientId: string;
  siteId: string;
}

export interface OperationDemandeSaisie {
  clientId: string;
  siteId: string;
  natureIntervention: string;
  dateHeurePrevue: Date;
  dureeEstimeeMinutes: number;
  equipementIds: string[];
  informationsParticulieres: string;
  uniteQuantite: QuantiteUnite;
  remarquesTerrain: string;
  nomSignataireClient: string;
  signatureClient: string;
}

export interface CreationOperationDemande {
  creer(saisie: OperationDemandeSaisie, parUtilisateur: string, sourceDemandeId: string): Promise<{ id: string }>;
}
