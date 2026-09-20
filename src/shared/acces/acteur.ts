import type { UserRole } from "@/shared/acces/roles";

/** Identité de l'appelant, telle que la voient les cas d'usage. */
export interface Acteur {
  id: string;
  role: UserRole;
  clientId?: string;
  equipeId?: string;
}
