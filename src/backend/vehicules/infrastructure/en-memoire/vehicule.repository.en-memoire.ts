import type { Vehicule, VehiculeSaisie } from "../../domain/vehicule";
import type { VehiculeRepository } from "../../domain/ports";

/**
 * Dépôt en mémoire pour les tests des cas d'usage. Fidèle au dépôt Mongoose sur le tri
 * (comparaison binaire, comme MongoDB sans collation) et la révision initiale ; il ne
 * reproduit PAS l'unicité de l'immatriculation (portée par l'index de la base).
 */
export class VehiculeRepositoryEnMemoire implements VehiculeRepository {
  private readonly donnees = new Map<string, Vehicule>();
  private compteur = 0;

  async lister(): Promise<Vehicule[]> {
    return [...this.donnees.values()].sort((a, b) =>
      a.identification < b.identification ? -1 : a.identification > b.identification ? 1 : 0
    );
  }

  async trouverParId(id: string): Promise<Vehicule | null> {
    return this.donnees.get(id) ?? null;
  }

  async creer(saisie: VehiculeSaisie): Promise<Vehicule> {
    this.compteur += 1;
    const maintenant = new Date();
    const vehicule: Vehicule = {
      id: `vehicule-${this.compteur}`,
      ...saisie,
      createdAt: maintenant,
      updatedAt: maintenant,
      revision: 0,
    };
    this.donnees.set(vehicule.id, vehicule);
    return vehicule;
  }

  async modifier(id: string, saisie: VehiculeSaisie): Promise<Vehicule | null> {
    const existant = this.donnees.get(id);
    if (!existant) return null;
    const modifie: Vehicule = { ...existant, ...saisie, updatedAt: new Date() };
    this.donnees.set(id, modifie);
    return modifie;
  }

  async supprimer(id: string): Promise<boolean> {
    return this.donnees.delete(id);
  }
}
