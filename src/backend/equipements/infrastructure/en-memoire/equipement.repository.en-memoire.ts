import type { Equipement, EquipementSaisie } from "../../domain/equipement";
import type { EquipementRepository } from "../../domain/ports";

/**
 * Dépôt en mémoire pour les tests des cas d'usage. Fidèle au dépôt Mongoose sur le tri
 * (comparaison binaire, comme MongoDB sans collation) et la révision initiale.
 */
export class EquipementRepositoryEnMemoire implements EquipementRepository {
  private readonly donnees = new Map<string, Equipement>();
  private compteur = 0;

  async lister(): Promise<Equipement[]> {
    return [...this.donnees.values()].sort((a, b) => (a.nom < b.nom ? -1 : a.nom > b.nom ? 1 : 0));
  }

  async trouverParId(id: string): Promise<Equipement | null> {
    return this.donnees.get(id) ?? null;
  }

  async creer(saisie: EquipementSaisie): Promise<Equipement> {
    this.compteur += 1;
    const maintenant = new Date();
    const equipement: Equipement = {
      id: `equipement-${this.compteur}`,
      ...saisie,
      createdAt: maintenant,
      updatedAt: maintenant,
      revision: 0,
    };
    this.donnees.set(equipement.id, equipement);
    return equipement;
  }

  async modifier(id: string, saisie: EquipementSaisie): Promise<Equipement | null> {
    const existant = this.donnees.get(id);
    if (!existant) return null;
    const modifie: Equipement = { ...existant, ...saisie, updatedAt: new Date() };
    this.donnees.set(id, modifie);
    return modifie;
  }

  async supprimer(id: string): Promise<boolean> {
    return this.donnees.delete(id);
  }
}
