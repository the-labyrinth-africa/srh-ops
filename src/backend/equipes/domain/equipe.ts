export interface Equipe {
  id: string;
  nom: string;
  membres: string[];
  disponibilite: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Numéro de révision technique conservé pour reproduire la réponse JSON à l'identique (`__v`). */
  revision?: number;
}

export interface EquipeSaisie {
  nom: string;
  membres: string[];
  disponibilite: boolean;
}
