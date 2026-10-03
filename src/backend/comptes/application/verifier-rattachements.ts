import type { RattachementsDeCompte } from "../domain/ports";

/**
 * Renvoie un message d'erreur si le client ou l'équipe auxquels on veut rattacher un compte
 * n'existent pas, `null` sinon. Le client est vérifié avant l'équipe ; un identifiant absent ou
 * vide n'est pas vérifié.
 */
export function creerVerificationRattachements({ rattachements }: { rattachements: RattachementsDeCompte }) {
  return async function erreurDeRattachement(saisie: { clientId?: string; equipeId?: string }): Promise<string | null> {
    if (saisie.clientId && !(await rattachements.clientExiste(saisie.clientId))) {
      return "Client introuvable";
    }
    if (saisie.equipeId && !(await rattachements.equipeExiste(saisie.equipeId))) {
      return "Équipe introuvable";
    }
    return null;
  };
}
