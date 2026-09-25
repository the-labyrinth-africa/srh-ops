export interface Equipement {
  id: string;
  nom: string;
  type: string;
  disponibilite: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Numéro de révision technique conservé pour reproduire la réponse JSON à l'identique (`__v`). */
  revision?: number;
}

export interface EquipementSaisie {
  nom: string;
  type: string;
  disponibilite: boolean;
}
