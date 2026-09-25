import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import { requireAuth } from "@/lib/api-auth";
import { isValidObjectId } from "@/backend/platform/http/identifiants";
import { appBaseUrl } from "@/backend/platform/http/url-applicative";
import { consumeRateLimit, type RateLimitResult } from "@/backend/platform/limiteur-debit/rate-limit";
import { issueResetToken } from "@/lib/auth/reset-token";
import { sendResetLinkMail } from "@/lib/auth/account-mail";
import { User } from "@/models/User";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const NO_STORE = { "Cache-Control": "no-store" };
const UNAVAILABLE = "Service momentanément indisponible. Réessayez plus tard.";

/** Envoie à l'utilisateur un lien de réinitialisation (administrateur uniquement). Ne modifie pas le mot de passe. */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403, headers: NO_STORE });
  }

  const { id } = await params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Identifiant invalide" }, { status: 400, headers: NO_STORE });
  }

  let limit: RateLimitResult;
  try {
    limit = await consumeRateLimit("send-link", id, { limit: 5, windowMs: 3_600_000 });
  } catch (error) {
    // Jamais de 500 par défaut : Next journaliserait l'erreur complète (URI Mongo possible).
    console.error("[send-reset-link] limiteur indisponible :", error instanceof Error ? error.name : "erreur");
    return NextResponse.json({ error: UNAVAILABLE }, { status: 503, headers: NO_STORE });
  }
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Trop de liens envoyés à ce compte. Réessayez plus tard." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  await connectDB();
  const user = await User.findById(id).select("nom email");
  if (!user) {
    return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404, headers: NO_STORE });
  }

  let result: { ok: boolean; reason?: string };
  try {
    // Base d'URL calculée AVANT d'émettre le jeton : sans URL valide, le jeton précédent reste intact.
    const base = appBaseUrl();
    const { token } = await issueResetToken(id, "reset");
    result = await sendResetLinkMail({ nom: user.nom, email: user.email }, `${base}/reset-password?token=${token}`);
  } catch (error) {
    console.error("[send-reset-link] impossible de préparer l'e-mail :", error instanceof Error ? error.name : "erreur");
    result = { ok: false, reason: "not_configured" };
  }

  return result.ok
    ? NextResponse.json({ sent: true }, { headers: NO_STORE })
    : NextResponse.json({ sent: false, reason: result.reason }, { status: 502, headers: NO_STORE });
}
