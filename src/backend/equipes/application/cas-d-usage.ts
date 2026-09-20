import type { Equipe, EquipeSaisie } from "../domain/equipe";
import { EquipeIntrouvable, EquipeRattachee } from "../domain/erreurs";
import type { EquipeRepository, RattachementsUtilisateurs } from "../domain/ports";

export interface DependancesEquipes {
  equipes: EquipeRepository;
  rattachements: RattachementsUtilisateurs;
}

export function creerCasDUsageEquipes({ equipes, rattachements }: DependancesEquipes) {
  return {
    lister(): Promise<Equipe[]> {
      return equipes.lister();
    },

    async obtenir(id: string): Promise<Equipe> {
      const equipe = await equipes.trouverParId(id);
      if (!equipe) throw new EquipeIntrouvable();
      return equipe;
    },

    creer(saisie: EquipeSaisie): Promise<Equipe> {
      return equipes.creer(saisie);
    },

    async modifier(id: string, saisie: EquipeSaisie): Promise<Equipe> {
      const equipe = await equipes.modifier(id, saisie);
      if (!equipe) throw new EquipeIntrouvable();
      return equipe;
    },

    async supprimer(id: string): Promise<void> {
      // Même ordre que la route d'origine : le rattachement est contrôlé avant l'existence.
      if (await rattachements.existePourEquipe(id)) throw new EquipeRattachee();
      const supprimee = await equipes.supprimer(id);
      if (!supprimee) throw new EquipeIntrouvable();
    },
  };
}

export type CasDUsageEquipes = ReturnType<typeof creerCasDUsageEquipes>;
