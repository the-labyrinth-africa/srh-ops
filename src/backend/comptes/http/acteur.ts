import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../composition";
import { canRead, canWrite, isChauffeur, isClientUser } from "@/shared/acces/permissions";
import type { UserRole } from "@/shared/acces/roles";

export interface AuthFailure {
  error: NextResponse;
  session?: undefined;
  user?: undefined;
  role?: undefined;
  clientId?: undefined;
  equipeId?: undefined;
}

export interface AuthSuccess {
  error?: undefined;
  session: Session;
  user: Session["user"];
  role: UserRole;
  /** Périmètre client du compte connecté (rôle `client` uniquement). */
  clientId?: string;
  /** Équipe du compte connecté (rôle `chauffeur` principalement). */
  equipeId?: string;
}

export type AuthResult = AuthFailure | AuthSuccess;

function fail(message: string, status: number, code?: string): AuthFailure {
  return { error: NextResponse.json(code ? { error: message, code } : { error: message }, { status }) };
}

/**
 * Authentifie l'appelant et expose son rôle, son périmètre client et son équipe.
 * Un compte `client` sans `clientId` en session est refusé partout (403), de même
 * qu'un compte au mot de passe temporaire (403 `MUST_CHANGE_PASSWORD`) sauf option contraire.
 */
export async function requireAuth(
  requireWrite = false,
  opts: { allowMustChangePassword?: boolean } = {}
): Promise<AuthResult> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return fail("Non authentifié", 401);
  }

  const role = session.user.role as UserRole;

  if (!canRead(role)) {
    return fail("Accès refusé", 403);
  }

  if (isClientUser(role) && !session.user.clientId) {
    return fail("Compte client sans périmètre attribué", 403);
  }

  if (session.user.mustChangePassword && !opts.allowMustChangePassword) {
    return fail("Changement de mot de passe requis", 403, "MUST_CHANGE_PASSWORD");
  }

  if (requireWrite && !canWrite(role)) {
    return fail("Permission insuffisante", 403);
  }

  return {
    session,
    user: session.user,
    role,
    clientId: session.user.clientId,
    equipeId: session.user.equipeId,
  };
}

/**
 * Routes internes (référentiels, récurrences, tableau de bord…) : les rôles
 * `client` et `chauffeur` n'y ont aucun accès, même en lecture.
 */
export async function requireInternalAuth(requireWrite = false): Promise<AuthResult> {
  const auth = await requireAuth(requireWrite);
  if (auth.error) return auth;

  if (isClientUser(auth.role) || isChauffeur(auth.role)) {
    return fail("Accès refusé", 403);
  }

  return auth;
}

/**
 * Référentiels clients/sites : lisibles par le personnel et, dans son périmètre,
 * par un compte `client` ; jamais par un chauffeur.
 */
export async function requireReferentialRead(): Promise<AuthResult> {
  const auth = await requireAuth();
  if (auth.error) return auth;

  if (isChauffeur(auth.role)) {
    return fail("Accès refusé", 403);
  }

  return auth;
}

/**
 * Écriture « terrain » (statut, données de collecte, photos) : admin, dispatcher
 * ou chauffeur. Les rôles `lecture` et `client` sont refusés.
 */
export async function requireTerrainWrite(): Promise<AuthResult> {
  const auth = await requireAuth();
  if (auth.error) return auth;

  if (!canWrite(auth.role) && !isChauffeur(auth.role)) {
    return fail("Permission insuffisante", 403);
  }

  return auth;
}
