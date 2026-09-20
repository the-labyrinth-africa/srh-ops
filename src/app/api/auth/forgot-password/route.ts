import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { appBaseUrl } from "@/lib/app-url";
import { consumeRateLimit, clientIp, type RateLimitResult } from "@/lib/rate-limit";
import { runAfterResponse } from "@/lib/run-after";
import { issueResetToken } from "@/lib/auth/reset-token";
import { sendResetLinkMail } from "@/lib/auth/account-mail";
import { forgotPasswordSchema } from "@/lib/validators/user";
import { User } from "@/models/User";

const HOUR = 3_600_000;
const NO_STORE = { "Cache-Control": "no-store" };

// Même réponse que le compte existe ou non : aucune énumération possible.
const GENERIC_MESSAGE =
  "Si un compte correspond à cet identifiant, un e-mail de réinitialisation vient d'être envoyé.";

function genericResponse() {
  return NextResponse.json({ message: GENERIC_MESSAGE }, { headers: NO_STORE });
}

async function sendLinkIfAccountExists(identifier: string): Promise<void> {
  await connectDB();
  const user = await User.findOne(
    identifier.includes("@") ? { email: identifier } : { username: identifier }
  ).select("_id nom email");
  if (!user) return;

  // Base d'URL calculée AVANT d'émettre le jeton : sans URL valide, le jeton précédent reste intact.
  const base = appBaseUrl();
  const { token } = await issueResetToken(String(user._id), "reset");
  const link = `${base}/reset-password?token=${token}`;
  await sendResetLinkMail({ nom: user.nom, email: user.email }, link);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Identifiant requis" }, { status: 400, headers: NO_STORE });
  }

  const identifier = parsed.data.identifier.trim().toLowerCase();

  let byIp: RateLimitResult;
  let byIdentifier: RateLimitResult;
  try {
    [byIp, byIdentifier] = await Promise.all([
      consumeRateLimit("forgot-ip", clientIp(req), { limit: 10, windowMs: HOUR }),
      consumeRateLimit("forgot-id", identifier, { limit: 5, windowMs: HOUR }),
    ]);
  } catch (error) {
    // Limiteur ou base indisponible : même réponse générique (aucun oracle sur les comptes,
    // jamais de 500), sans envoi. Seul le nom de l'erreur est journalisé.
    console.error("[forgot-password] limiteur indisponible :", error instanceof Error ? error.name : "erreur");
    return genericResponse();
  }

  if (!byIp.allowed || !byIdentifier.allowed) {
    const retryAfter = Math.max(byIp.retryAfterSeconds, byIdentifier.retryAfterSeconds);
    return NextResponse.json(
      { error: "Trop de demandes. Réessayez plus tard." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(retryAfter) } }
    );
  }

  // Recherche, jeton et envoi après la réponse : le temps de réponse ne dépend pas de l'existence du compte.
  await runAfterResponse(() => sendLinkIfAccountExists(identifier));

  return genericResponse();
}
