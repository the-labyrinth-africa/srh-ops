import type { Vehicule, VehiculeSaisie } from "./vehicule";

export interface VehiculeRepository {
  /** Tous les véhicules, triés par immatriculation croissante (ordre binaire de MongoDB). */
  lister(): Promise<Vehicule[]>;
  trouverParId(id: string): Promise<Vehicule | null>;
  /** Peut échouer (erreur du dépôt) si l'immatriculation existe déjà : l'erreur n'est pas interceptée. */
  creer(saisie: VehiculeSaisie): Promise<Vehicule>;
  /** null si le véhicule n'existe pas. */
  modifier(id: string, saisie: VehiculeSaisie): Promise<Vehicule | null>;
  /** false si le véhicule n'existait pas. */
  supprimer(id: string): Promise<boolean>;
}
