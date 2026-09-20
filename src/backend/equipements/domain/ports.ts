import type { Equipement, EquipementSaisie } from "./equipement";

export interface EquipementRepository {
  /** Tous les équipements, triés par nom croissant (ordre binaire de MongoDB). */
  lister(): Promise<Equipement[]>;
  trouverParId(id: string): Promise<Equipement | null>;
  creer(saisie: EquipementSaisie): Promise<Equipement>;
  /** null si l'équipement n'existe pas. */
  modifier(id: string, saisie: EquipementSaisie): Promise<Equipement | null>;
  /** false si l'équipement n'existait pas. */
  supprimer(id: string): Promise<boolean>;
}
