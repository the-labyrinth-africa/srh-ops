import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/backend/comptes/infrastructure/next-auth/options";
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

/** Normalise un identifiant Mongo (ObjectId, document peuplé ou chaîne). */
export function extractId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && "_id" in (value as Record<string, unknown>)) {
    return String((value as { _id: unknown })._id);
  }
  return String(value);
}

/**
 * Vrai si le document (via son `clientId`) est dans le périmètre de l'appelant.
 * Les rôles internes voient tout ; un compte `client` ne voit que son client.
 */
export function isWithinClientScope(auth: AuthSuccess, documentClientId: unknown): boolean {
  if (!isClientUser(auth.role)) return true;
  if (!auth.clientId) return false;
  return extractId(documentClientId) === String(auth.clientId);
}

/** Message unique quand une opération n'appartient pas à l'équipe du chauffeur. */
export const TEAM_SCOPE_ERROR = "Opération non affectée à votre équipe";

/**
 * Réponse 403 quand un compte chauffeur n'a aucune équipe en session (à appeler
 * par les routes qui lisent des opérations), sinon `null`.
 */
export function chauffeurWithoutTeamError(auth: AuthSuccess): NextResponse | null {
  if (isChauffeur(auth.role) && !auth.equipeId) {
    return NextResponse.json({ error: "Compte chauffeur sans équipe attribuée" }, { status: 403 });
  }
  return null;
}

/**
 * Vrai si le chauffeur connecté peut agir sur l'opération. Refus par défaut :
 * un chauffeur sans équipe en session n'agit sur rien, et une opération non
 * affectée n'est pas visible d'un chauffeur.
 */
export function isWithinTeamScope(auth: AuthSuccess, operationEquipeId: unknown): boolean {
  if (!isChauffeur(auth.role)) return true;
  if (!auth.equipeId) return false;
  const opTeam = extractId(operationEquipeId);
  return opTeam !== "" && opTeam === String(auth.equipeId);
}
