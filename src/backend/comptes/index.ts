// API publique du domaine `comptes` pour les autres domaines.
export { existeUtilisateurAvecClientId, existeUtilisateurAvecEquipeId } from "./composition";
export {
  requireAuth,
  requireInternalAuth,
  requireReferentialRead,
  requireTerrainWrite,
} from "./http/acteur";
export type { AuthResult, AuthSuccess, AuthFailure } from "./http/acteur";
export { requirePageAccess } from "./http/garde-pages";
