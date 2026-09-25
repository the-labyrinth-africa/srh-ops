import type { Client, ClientSaisie } from "../../domain/client";
import type { ClientRepository } from "../../domain/ports";

/** Dépôt en mémoire pour les tests des cas d'usage. Fidèle au dépôt Mongoose sur le tri
 * (comparaison binaire) et la révision initiale ; ne reproduit pas de contrainte d'unicité
 * (il n'y en a aucune sur `Client`). */
export class ClientRepositoryEnMemoire implements ClientRepository {
  private readonly donnees = new Map<string, Client>();
  private compteur = 0;

  async lister(idClient?: string): Promise<Client[]> {
    const valeurs = [...this.donnees.values()].filter((c) => !idClient || c.id === idClient);
    return valeurs.sort((a, b) => (a.nom < b.nom ? -1 : a.nom > b.nom ? 1 : 0));
  }

  async trouverParId(id: string): Promise<Client | null> {
    return this.donnees.get(id) ?? null;
  }

  async creer(saisie: ClientSaisie): Promise<Client> {
    this.compteur += 1;
    const maintenant = new Date();
    const client: Client = {
      id: `client-${this.compteur}`,
      nom: saisie.nom,
      // Le dépôt Mongoose applique le défaut du schéma ("") à la création ; on reproduit ce
      // comportement ici pour que l'entité `Client` (lecture) respecte son invariant `email: string`.
      contact: { telephone: saisie.contact.telephone, email: saisie.contact.email ?? "" },
      createdAt: maintenant,
      updatedAt: maintenant,
      revision: 0,
    };
    this.donnees.set(client.id, client);
    return client;
  }

  async modifier(id: string, saisie: ClientSaisie): Promise<Client | null> {
    const existant = this.donnees.get(id);
    if (!existant) return null;
    const modifie: Client = {
      ...existant,
      nom: saisie.nom,
      contact: { telephone: saisie.contact.telephone, email: saisie.contact.email ?? "" },
      updatedAt: new Date(),
    };
    this.donnees.set(id, modifie);
    return modifie;
  }

  async supprimer(id: string): Promise<boolean> {
    return this.donnees.delete(id);
  }
}
