import type { Equipe, EquipeSaisie } from "./equipe";

export interface EquipeRepository {
  /** Toutes les équipes, triées par nom croissant. */
  lister(): Promise<Equipe[]>;
  trouverParId(id: string): Promise<Equipe | null>;
  creer(saisie: EquipeSaisie): Promise<Equipe>;
  /** null si l'équipe n'existe pas. */
  modifier(id: string, saisie: EquipeSaisie): Promise<Equipe | null>;
  /** false si l'équipe n'existait pas. */
  supprimer(id: string): Promise<boolean>;
}

export interface RattachementsUtilisateurs {
  existePourEquipe(equipeId: string): Promise<boolean>;
}
