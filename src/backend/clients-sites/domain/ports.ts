import type { Client, ClientSaisie } from "./client";

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
