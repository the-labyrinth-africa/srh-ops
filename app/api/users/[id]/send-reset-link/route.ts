import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { guardObjectId } from "@/lib/mongo-id";
import { appBaseUrl } from "@/lib/app-url";
import { consumeRateLimit } from "@/lib/rate-limit";
import { issueResetToken } from "@/lib/auth/reset-token";
import { sendResetLinkMail } from "@/lib/auth/account-mail";
import { User } from "@/models/User";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const NO_STORE = { "Cache-Control": "no-store" };

/** Envoie à l'utilisateur un lien de réinitialisation (administrateur uniquement). Ne modifie pas le mot de passe. */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  const limit = await consumeRateLimit("send-link", id, { limit: 5, windowMs: 3_600_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Trop de liens envoyés à ce compte. Réessayez plus tard." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  await connectDB();
  const user = await User.findById(id).select("nom email");
  if (!user) {
    return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
  }

  let result: { ok: boolean; reason?: string };
  try {
    const { token } = await issueResetToken(id, "reset");
    result = await sendResetLinkMail({ nom: user.nom, email: user.email }, `${appBaseUrl()}/reset-password?token=${token}`);
  } catch {
    result = { ok: false, reason: "not_configured" };
  }

  return result.ok
    ? NextResponse.json({ sent: true }, { headers: NO_STORE })
    : NextResponse.json({ sent: false, reason: result.reason }, { status: 502, headers: NO_STORE });
}
