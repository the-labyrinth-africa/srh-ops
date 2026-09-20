import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { consumeRateLimit, type RateLimitResult } from "@/lib/rate-limit";
import { sendMail } from "@/lib/mail";
import { User } from "@/models/User";

const NO_STORE = { "Cache-Control": "no-store" };
const UNAVAILABLE = "Service momentanément indisponible. Réessayez plus tard.";

/** Envoie un e-mail de test à l'adresse du compte administrateur connecté. */
export async function POST() {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  let limit: RateLimitResult;
  try {
    limit = await consumeRateLimit("mail-test", auth.user.id, { limit: 5, windowMs: 3_600_000 });
  } catch (error) {
    // Jamais de 500 par défaut : Next journaliserait l'erreur complète (URI Mongo possible).
    console.error("[mail-test] limiteur indisponible :", error instanceof Error ? error.name : "erreur");
    return NextResponse.json({ error: UNAVAILABLE }, { status: 503, headers: NO_STORE });
  }
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Trop d'e-mails de test. Réessayez plus tard." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  await connectDB();
  const user = await User.findById(auth.user.id).select("email nom").lean<{ email: string; nom: string }>();
  if (!user) {
    return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
  }

  const result = await sendMail({
    to: user.email,
    subject: "SRH Ops — e-mail de test",
    text: `Bonjour ${user.nom},\n\nCet e-mail confirme que l'envoi de messages depuis SRH Ops fonctionne.\n\nL'équipe SRH Ops`,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 502, headers: NO_STORE });
}
