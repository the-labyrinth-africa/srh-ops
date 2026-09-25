import type { Client, ClientSaisie } from "../domain/client";
import { ClientIntrouvable, ClientRattache } from "../domain/erreurs";
import type { ClientRepository, RattachementsUtilisateurs } from "../domain/ports";

export interface DependancesClients {
  clients: ClientRepository;
  rattachements: RattachementsUtilisateurs;
}

export function creerCasDUsageClients({ clients, rattachements }: DependancesClients) {
  return {
    lister(idClient?: string): Promise<Client[]> {
      return clients.lister(idClient);
    },

    async obtenir(id: string): Promise<Client> {
      const client = await clients.trouverParId(id);
      if (!client) throw new ClientIntrouvable();
      return client;
    },

    creer(saisie: ClientSaisie): Promise<Client> {
      return clients.creer(saisie);
    },

    async modifier(id: string, saisie: ClientSaisie): Promise<Client> {
      const client = await clients.modifier(id, saisie);
      if (!client) throw new ClientIntrouvable();
      return client;
    },

    async supprimer(id: string): Promise<void> {
      if (await rattachements.existePourClient(id)) throw new ClientRattache();
      if (!(await clients.supprimer(id))) throw new ClientIntrouvable();
    },
  };
}

export type CasDUsageClients = ReturnType<typeof creerCasDUsageClients>;
