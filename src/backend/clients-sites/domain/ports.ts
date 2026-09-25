import type { Client, ClientSaisie } from "./client";
import type { Site, SiteSaisie, SiteAvecClientPeuple } from "./site";

export interface ClientRepository {
  /** Tous les clients, ou seulement `idClient` si fourni (périmètre d'un compte `client`), triés par nom croissant. */
  lister(idClient?: string): Promise<Client[]>;
  trouverParId(id: string): Promise<Client | null>;
  creer(saisie: ClientSaisie): Promise<Client>;
  /** null si le client n'existe pas. */
  modifier(id: string, saisie: ClientSaisie): Promise<Client | null>;
  /** false si le client n'existait pas. */
  supprimer(id: string): Promise<boolean>;
}

export interface RattachementsUtilisateurs {
  existePourClient(clientId: string): Promise<boolean>;
}

export interface SiteRepository {
  /** Tous les sites, ou filtrés par `clientId` si fourni ; triés par nom croissant ; `clientId` peuplé (`{id, nom}`). */
  lister(clientId?: string): Promise<SiteAvecClientPeuple[]>;
  /** `clientId` peuplé (`{id, nom}`). */
  trouverParId(id: string): Promise<SiteAvecClientPeuple | null>;
  /** `clientId` NON peuplé (chaîne), comme l'API actuelle (pas de populate à l'écriture). */
  creer(saisie: SiteSaisie): Promise<Site>;
  /** `clientId` NON peuplé ; null si le site n'existe pas. */
  modifier(id: string, saisie: SiteSaisie): Promise<Site | null>;
  /** false si le site n'existait pas ; aucun contrôle de rattachement. */
  supprimer(id: string): Promise<boolean>;
}
