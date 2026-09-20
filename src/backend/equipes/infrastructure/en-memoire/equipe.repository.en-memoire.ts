import type { Equipe, EquipeSaisie } from "../../domain/equipe";
import type { EquipeRepository, RattachementsUtilisateurs } from "../../domain/ports";

/** Dépôt en mémoire : sert aux tests des cas d'usage (aucune base nécessaire). */
export class EquipeRepositoryEnMemoire implements EquipeRepository {
  private readonly donnees = new Map<string, Equipe>();
  private compteur = 0;

  async lister(): Promise<Equipe[]> {
    // Tri binaire (point de code) sur `nom`, comme MongoDB sans collation : « Zeta » précède « alpha ».
    return [...this.donnees.values()].sort((a, b) => (a.nom < b.nom ? -1 : a.nom > b.nom ? 1 : 0));
  }

  async trouverParId(id: string): Promise<Equipe | null> {
    return this.donnees.get(id) ?? null;
  }

  async creer(saisie: EquipeSaisie): Promise<Equipe> {
    this.compteur += 1;
    const maintenant = new Date();
    const equipe: Equipe = {
      id: `equipe-${this.compteur}`,
      ...saisie,
      createdAt: maintenant,
      updatedAt: maintenant,
      revision: 0, // `__v` d'un document Mongoose fraîchement créé
    };
    this.donnees.set(equipe.id, equipe);
    return equipe;
  }

  async modifier(id: string, saisie: EquipeSaisie): Promise<Equipe | null> {
    const existante = this.donnees.get(id);
    if (!existante) return null;
    const modifiee: Equipe = { ...existante, ...saisie, updatedAt: new Date() };
    this.donnees.set(id, modifiee);
    return modifiee;
  }

  async supprimer(id: string): Promise<boolean> {
    return this.donnees.delete(id);
  }
}

export class RattachementsUtilisateursEnMemoire implements RattachementsUtilisateurs {
  private readonly equipesRattachees = new Set<string>();

  rattacher(equipeId: string): void {
    this.equipesRattachees.add(equipeId);
  }

  async existePourEquipe(equipeId: string): Promise<boolean> {
    return this.equipesRattachees.has(equipeId);
  }
}
