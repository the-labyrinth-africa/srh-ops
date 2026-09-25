export interface Site {
  id: string;
  clientId: string;
  nom: string;
  adresse: string;
  localisation?: { lat: number; lng: number };
  typeDechets: string[];
  observations: string;
  createdAt: Date;
  updatedAt: Date;
  revision?: number;
}

export interface SiteSaisie {
  clientId: string;
  nom: string;
  adresse: string;
  localisation?: { lat: number; lng: number };
  typeDechets: string[];
  observations: string;
}

/** Forme d'un site dont le `clientId` a été peuplé (nom du client), pour les réponses des routes de lecture. */
export interface SiteAvecClientPeuple extends Omit<Site, "clientId"> {
  clientId: string | { id: string; nom: string };
}
