import type { Equipement, EquipementSaisie } from "../domain/equipement";
import { EquipementIntrouvable } from "../domain/erreurs";
import type { EquipementRepository } from "../domain/ports";

export interface DependancesEquipements {
  equipements: EquipementRepository;
}

export function creerCasDUsageEquipements({ equipements }: DependancesEquipements) {
  return {
    lister(): Promise<Equipement[]> {
      return equipements.lister();
    },

    async obtenir(id: string): Promise<Equipement> {
      const equipement = await equipements.trouverParId(id);
      if (!equipement) throw new EquipementIntrouvable();
      return equipement;
    },

    creer(saisie: EquipementSaisie): Promise<Equipement> {
      return equipements.creer(saisie);
    },

    async modifier(id: string, saisie: EquipementSaisie): Promise<Equipement> {
      const equipement = await equipements.modifier(id, saisie);
      if (!equipement) throw new EquipementIntrouvable();
      return equipement;
    },

    async supprimer(id: string): Promise<void> {
      // Aucun contrôle de rattachement : identique à la route d'origine.
      if (!(await equipements.supprimer(id))) throw new EquipementIntrouvable();
    },
  };
}

export type CasDUsageEquipements = ReturnType<typeof creerCasDUsageEquipements>;
