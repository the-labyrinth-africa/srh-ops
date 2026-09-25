import type { Site, SiteSaisie, SiteAvecClientPeuple } from "../../domain/site";
import type { SiteRepository } from "../../domain/ports";

/** Dépôt en mémoire pour les tests des cas d'usage. La « population » du client y est
 * simulée par un nom fixe : les tests de cas d'usage ne portent pas sur son contenu réel
 * (couvert par le test de contrat Mongoose), seulement sur sa présence en lecture. */
export class SiteRepositoryEnMemoire implements SiteRepository {
  private readonly donnees = new Map<string, Site>();
  private compteur = 0;

  private peupler(site: Site): SiteAvecClientPeuple {
    return { ...site, clientId: { id: site.clientId, nom: `client-${site.clientId}` } };
  }

  async lister(clientId?: string): Promise<SiteAvecClientPeuple[]> {
    const valeurs = [...this.donnees.values()].filter((s) => !clientId || s.clientId === clientId);
    return valeurs.sort((a, b) => (a.nom < b.nom ? -1 : a.nom > b.nom ? 1 : 0)).map((s) => this.peupler(s));
  }

  async trouverParId(id: string): Promise<SiteAvecClientPeuple | null> {
    const site = this.donnees.get(id);
    return site ? this.peupler(site) : null;
  }

  async creer(saisie: SiteSaisie): Promise<Site> {
    this.compteur += 1;
    const maintenant = new Date();
    const site: Site = { id: `site-${this.compteur}`, ...saisie, createdAt: maintenant, updatedAt: maintenant, revision: 0 };
    this.donnees.set(site.id, site);
    return site;
  }

  async modifier(id: string, saisie: SiteSaisie): Promise<Site | null> {
    const existant = this.donnees.get(id);
    if (!existant) return null;
    const modifie: Site = { ...existant, ...saisie, updatedAt: new Date() };
    this.donnees.set(id, modifie);
    return modifie;
  }

  async supprimer(id: string): Promise<boolean> {
    return this.donnees.delete(id);
  }
}
