import type { Acteur } from "@/shared/acces/acteur";
import { isChauffeur, isClientUser } from "@/shared/acces/permissions";

/** Message unique quand une opération n'appartient pas à l'équipe du chauffeur. */
export const MESSAGE_HORS_EQUIPE = "Opération non affectée à votre équipe";
export const MESSAGE_CHAUFFEUR_SANS_EQUIPE = "Compte chauffeur sans équipe attribuée";

/** `null` : référence pendante (document référencé supprimé) ; `undefined` : pas d'affectation. */
export interface RattachementsOperation {
  clientId?: string | null;
  equipeId?: string | null;
}

/** Un chauffeur sans équipe ne lit aucune opération (refus avant toute lecture). */
export function chauffeurSansEquipe(acteur: Acteur): boolean {
  return isChauffeur(acteur.role) && !acteur.equipeId;
}

/** Un compte client sans client ne lit aucune opération (refus avant toute lecture). */
export function compteClientSansPerimetre(acteur: Acteur): boolean {
  return isClientUser(acteur.role) && !acteur.clientId;
}

/** Les rôles internes voient tout ; un compte `client` ne voit que son client. */
export function dansPerimetreClient(acteur: Acteur, clientId?: string | null): boolean {
  if (!isClientUser(acteur.role)) return true;
  if (!acteur.clientId) return false;
  return (clientId ?? "") === acteur.clientId;
}

/**
 * Refus par défaut : un chauffeur sans équipe n'agit sur rien, et une opération
 * non affectée n'est pas visible d'un chauffeur.
 */
export function dansPerimetreEquipe(acteur: Acteur, equipeId?: string | null): boolean {
  if (!isChauffeur(acteur.role)) return true;
  if (!acteur.equipeId) return false;
  const equipe = equipeId ?? "";
  return equipe !== "" && equipe === acteur.equipeId;
}

/** Lecture d'une opération (détail, rapport) : hors périmètre, elle est « non trouvée ». */
export function peutVoirOperation(acteur: Acteur, operation: RattachementsOperation): boolean {
  return dansPerimetreClient(acteur, operation.clientId) && dansPerimetreEquipe(acteur, operation.equipeId);
}

/** Écriture terrain (statut, photos) : seule l'équipe du chauffeur compte. */
export function peutAgirSurOperation(acteur: Acteur, operation: RattachementsOperation): boolean {
  return dansPerimetreEquipe(acteur, operation.equipeId);
}

/** Filtres imposés aux listes (opérations, planning), quels que soient les filtres demandés. */
export function perimetreDeLecture(acteur: Acteur): { clientId?: string; equipeId?: string } {
  const perimetre: { clientId?: string; equipeId?: string } = {};
  if (isClientUser(acteur.role)) perimetre.clientId = acteur.clientId;
  if (isChauffeur(acteur.role)) perimetre.equipeId = acteur.equipeId;
  return perimetre;
}
