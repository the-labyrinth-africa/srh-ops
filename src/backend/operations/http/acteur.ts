// src/backend/operations/http/acteur.ts
import type { AuthSuccess } from "@/backend/comptes";
import type { Acteur } from "@/shared/acces/acteur";

/** Identité de la session, telle que la reçoivent les cas d'usage. */
export function versActeur(auth: AuthSuccess): Acteur {
  return { id: auth.user.id, role: auth.role, clientId: auth.clientId, equipeId: auth.equipeId };
}
