import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { canRead, canWrite, isChauffeur, isClientUser } from "@/lib/permissions";
import type { UserRole } from "@/types";

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

function fail(message: string, status: number): AuthFailure {
  return { error: NextResponse.json({ error: message }, { status }) };
}

/**
 * Authentifie l'appelant et expose son rôle, son périmètre client et son équipe.
 * Un compte `client` sans `clientId` en session est refusé partout (403).
 */
export async function requireAuth(requireWrite = false): Promise<AuthResult> {
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
 * Routes internes (référentiels, récurrences, tableau de bord…) : le rôle `client`
 * n'y a aucun accès, même en lecture.
 */
export async function requireInternalAuth(requireWrite = false): Promise<AuthResult> {
  const auth = await requireAuth(requireWrite);
  if (auth.error) return auth;

  if (isClientUser(auth.role)) {
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
  return extractId(documentClientId) === String(auth.clientId ?? "");
}

/**
 * Vrai si le chauffeur connecté peut agir sur l'opération. Un chauffeur rattaché
 * à une équipe n'agit que sur les opérations de son équipe ; un chauffeur sans
 * équipe en session n'est pas restreint (aucun rattachement exploitable).
 */
export function isWithinTeamScope(auth: AuthSuccess, operationEquipeId: unknown): boolean {
  if (!isChauffeur(auth.role)) return true;
  if (!auth.equipeId) return true;
  return extractId(operationEquipeId) === String(auth.equipeId);
}
