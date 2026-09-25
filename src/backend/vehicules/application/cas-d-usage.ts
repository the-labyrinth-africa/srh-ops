import type { Vehicule, VehiculeSaisie } from "../domain/vehicule";
import { VehiculeIntrouvable } from "../domain/erreurs";
import type { VehiculeRepository } from "../domain/ports";

export interface DependancesVehicules {
  vehicules: VehiculeRepository;
}

export function creerCasDUsageVehicules({ vehicules }: DependancesVehicules) {
  return {
    lister(): Promise<Vehicule[]> {
      return vehicules.lister();
    },

    async obtenir(id: string): Promise<Vehicule> {
      const vehicule = await vehicules.trouverParId(id);
      if (!vehicule) throw new VehiculeIntrouvable();
      return vehicule;
    },

    creer(saisie: VehiculeSaisie): Promise<Vehicule> {
      return vehicules.creer(saisie);
    },

    async modifier(id: string, saisie: VehiculeSaisie): Promise<Vehicule> {
      const vehicule = await vehicules.modifier(id, saisie);
      if (!vehicule) throw new VehiculeIntrouvable();
      return vehicule;
    },

    async supprimer(id: string): Promise<void> {
      // Aucun contrôle de rattachement : identique à la route d'origine.
      if (!(await vehicules.supprimer(id))) throw new VehiculeIntrouvable();
    },
  };
}

export type CasDUsageVehicules = ReturnType<typeof creerCasDUsageVehicules>;
