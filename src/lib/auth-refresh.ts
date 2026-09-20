import type { JWT } from "next-auth/jwt";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import { User } from "@/models/User";
import type { UserRole } from "@/shared/acces/roles";

interface RefreshedUser {
  role: UserRole;
  clientId?: unknown;
  equipeId?: unknown;
  mustChangePassword?: boolean;
  passwordChangedAt?: Date;
}

/**
 * Intervalle maximal entre deux relectures du compte dans la base.
 *
 * Attention : `getServerSession` côté serveur ne peut pas réécrire le cookie de
 * session, donc le `refreshedAt` rafraîchi n'est persisté que par le fetch
 * `/api/auth/session` du client. Un trafic uniquement serveur au-delà de cet
 * intervalle relit donc le compte (un `User.findById` indexé) à chaque appel.
 */
export const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export function needsRefresh(token: JWT, now = Date.now()): boolean {
  return !token.refreshedAt || now - token.refreshedAt > REFRESH_INTERVAL_MS;
}

/**
 * Recharge depuis la base les attributs qui commandent les droits : un
 * changement de rôle, de rattachement ou de mot de passe temporaire est pris
 * en compte sans attendre une nouvelle connexion, et un compte supprimé rend
 * le jeton invalide. Une réinitialisation du mot de passe (`passwordChangedAt`)
 * postérieure à la connexion (`issuedAt`) invalide aussi le jeton ; un jeton sans
 * `issuedAt` est considéré comme antérieur. Comme la relecture n'a lieu qu'au plus
 * toutes les `REFRESH_INTERVAL_MS` (5 minutes), l'invalidation prend effet au plus
 * 5 minutes après la réinitialisation.
 */
export async function refreshTokenFromDb(token: JWT): Promise<JWT> {
  await connectDB();
  const user = await User.findById(token.id)
    .select("role clientId equipeId mustChangePassword passwordChangedAt")
    .lean<RefreshedUser | null>();

  if (!user) {
    return { ...token, invalid: true, refreshedAt: Date.now() };
  }

  if (user.passwordChangedAt && (token.issuedAt ?? 0) < user.passwordChangedAt.getTime()) {
    return { ...token, invalid: true, refreshedAt: Date.now() };
  }

  return {
    ...token,
    invalid: false,
    role: user.role,
    clientId: user.clientId ? String(user.clientId) : undefined,
    equipeId: user.equipeId ? String(user.equipeId) : undefined,
    mustChangePassword: Boolean(user.mustChangePassword),
    refreshedAt: Date.now(),
  };
}
