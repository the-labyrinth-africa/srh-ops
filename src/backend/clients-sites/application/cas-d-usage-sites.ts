import type { Site, SiteSaisie, SiteAvecClientPeuple } from "../domain/site";
import { SiteIntrouvable } from "../domain/erreurs";
import type { SiteRepository } from "../domain/ports";

export interface DependancesSites {
  sites: SiteRepository;
}

export function creerCasDUsageSites({ sites }: DependancesSites) {
  return {
    lister(clientId?: string): Promise<SiteAvecClientPeuple[]> {
      return sites.lister(clientId);
    },

    async obtenir(id: string): Promise<SiteAvecClientPeuple> {
      const site = await sites.trouverParId(id);
      if (!site) throw new SiteIntrouvable();
      return site;
    },

    creer(saisie: SiteSaisie): Promise<Site> {
      // Aucune vérification que `clientId` référence un client existant : identique à la route d'origine.
      return sites.creer(saisie);
    },

    async modifier(id: string, saisie: SiteSaisie): Promise<Site> {
      const site = await sites.modifier(id, saisie);
      if (!site) throw new SiteIntrouvable();
      return site;
    },

    async supprimer(id: string): Promise<void> {
      // Aucun contrôle de rattachement : identique à la route d'origine.
      if (!(await sites.supprimer(id))) throw new SiteIntrouvable();
    },
  };
}

export type CasDUsageSites = ReturnType<typeof creerCasDUsageSites>;
