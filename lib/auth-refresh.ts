import type { JWT } from "next-auth/jwt";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import type { UserRole } from "@/types";

interface RefreshedUser {
  role: UserRole;
  clientId?: unknown;
  equipeId?: unknown;
  mustChangePassword?: boolean;
}

/** Intervalle maximal entre deux relectures du compte dans la base. */
export const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export function needsRefresh(token: JWT, now = Date.now()): boolean {
  return !token.refreshedAt || now - token.refreshedAt > REFRESH_INTERVAL_MS;
}

/**
 * Recharge depuis la base les attributs qui commandent les droits : un
 * changement de rôle, de rattachement ou de mot de passe temporaire est pris
 * en compte sans attendre une nouvelle connexion, et un compte supprimé rend
 * le jeton invalide.
 */
export async function refreshTokenFromDb(token: JWT): Promise<JWT> {
  await connectDB();
  const user = await User.findById(token.id)
    .select("role clientId equipeId mustChangePassword")
    .lean<RefreshedUser | null>();

  if (!user) {
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
