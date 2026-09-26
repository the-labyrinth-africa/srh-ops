import type { Utilisateur } from "../domain/utilisateur";

/**
 * Forme JSON historique d'un rattachement peuplé (`clientId`/`equipeId`) : absent si `undefined`
 * (jamais rattaché), `null` si présent mais non résolu (référence pendante), `{_id, nom}` sinon.
 * Trois voies, contrairement à `versClientJson` en R2 (`Site.clientId` n'a que deux états).
 */
function versRelationJson(
  valeur: { id: string; nom: string } | null | undefined
): { _id: string; nom: string } | null | undefined {
  if (valeur === undefined) return undefined;
  if (valeur === null) return null;
  return { _id: valeur.id, nom: valeur.nom };
}

/** Forme JSON historique de l'API pour un utilisateur (liste, détail, création, modification). */
export function versReponseUtilisateur(utilisateur: Utilisateur) {
  return {
    _id: utilisateur.id,
    username: utilisateur.username,
    nom: utilisateur.nom,
    email: utilisateur.email,
    role: utilisateur.role,
    clientId: versRelationJson(utilisateur.clientId),
    equipeId: versRelationJson(utilisateur.equipeId),
    telephone: utilisateur.telephone,
    mustChangePassword: utilisateur.mustChangePassword,
    passwordChangedAt: utilisateur.passwordChangedAt,
    createdAt: utilisateur.createdAt,
    updatedAt: utilisateur.updatedAt,
    __v: utilisateur.revision,
  };
}
