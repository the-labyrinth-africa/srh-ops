import type {
  DemandePublique,
  DemandePubliqueSaisie,
  QualificationDemande,
} from "./demande";

export interface DemandesPubliquesRepository {
  creer(saisie: DemandePubliqueSaisie, maintenant: Date): Promise<DemandePublique>;
  lister(): Promise<DemandePublique[]>;
  trouverParId(id: string): Promise<DemandePublique | null>;
  acquerirConversion(id: string, maintenant: Date): Promise<DemandePublique | null>;
  marquerConvertie(
    id: string,
    qualification: QualificationDemande,
    operationId: string,
    utilisateurId: string,
    maintenant: Date
  ): Promise<boolean>;
  libererConversion(id: string): Promise<void>;
  refuser(id: string, utilisateurId: string, motif: string, maintenant: Date): Promise<boolean>;
}

export interface HorlogeDemandes {
  maintenant(): Date;
}

export interface LimiteurDemandes {
  (
    portee: string,
    identifiant: string,
    options: { limit: number; windowMs: number }
  ): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }>;
}

export interface AppartenanceSiteClient {
  (siteId: string, clientId: string): Promise<boolean>;
}
