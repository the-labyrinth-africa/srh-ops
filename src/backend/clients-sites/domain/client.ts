export interface Client {
  id: string;
  nom: string;
  contact: { telephone: string; email: string };
  createdAt: Date;
  updatedAt: Date;
  /** Numéro de révision technique conservé pour reproduire la réponse JSON à l'identique (`__v`). */
  revision?: number;
}

export interface ClientSaisie {
  nom: string;
  contact: { telephone: string; email?: string };
}
