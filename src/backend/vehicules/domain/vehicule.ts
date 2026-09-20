export interface Vehicule {
  id: string;
  identification: string;
  type: string;
  capacite: number;
  disponibilite: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Numéro de révision technique conservé pour reproduire la réponse JSON à l'identique (`__v`). */
  revision?: number;
}

export interface VehiculeSaisie {
  identification: string;
  type: string;
  capacite: number;
  disponibilite: boolean;
}
