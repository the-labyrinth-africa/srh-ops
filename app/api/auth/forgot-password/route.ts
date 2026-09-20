import { NextResponse } from "next/server";

export const UNAVAILABLE_MESSAGE =
  "Réinitialisation en libre-service indisponible. Contactez un administrateur SRH.";

/**
 * Réinitialisation en libre-service désactivée (C4).
 *
 * L'implémentation précédente réécrivait le hash du mot de passe de n'importe
 * quel compte nommé dans le corps de la requête, sans jeton de vérification ni
 * limitation de débit : n'importe qui pouvait bloquer le compte administrateur.
 * En attendant un vrai flux de réinitialisation (jeton à usage unique, envoi
 * e-mail réel, limitation de débit), la route répond 503 sans jamais toucher à
 * la base. La réinitialisation passe par un administrateur (/utilisateurs).
 */
export async function POST() {
  return NextResponse.json({ error: UNAVAILABLE_MESSAGE }, { status: 503 });
}
