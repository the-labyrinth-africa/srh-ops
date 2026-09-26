import type { UserRole } from "@/shared/acces/roles";

export interface Utilisateur {
  id: string;
  username: string;
  nom: string;
  email: string;
  role: UserRole;
  /** absent si non rattaché ; `null` si la référence est pendante (client supprimé) ; peuplé sinon. */
  clientId?: { id: string; nom: string } | null;
  equipeId?: { id: string; nom: string } | null;
  telephone: string;
  mustChangePassword: boolean;
  passwordChangedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  revision?: number;
}

/** Saisie d'écriture : clientId/equipeId en chaîne brute (jamais peuplés à l'écriture). */
export interface UtilisateurSaisie {
  username: string;
  nom: string;
  email: string;
  role: UserRole;
  telephone: string;
  clientId?: string;
  equipeId?: string;
}
