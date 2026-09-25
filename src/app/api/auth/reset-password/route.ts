import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import { consumeRateLimit, type RateLimitResult } from "@/backend/platform/limiteur-debit/rate-limit";
import { clientIp } from "@/lib/rate-limit";
import { runAfterResponse } from "@/lib/run-after";
import { consumeResetToken } from "@/lib/auth/reset-token";
import { sendPasswordChangedMail } from "@/lib/auth/account-mail";
import { User } from "@/models/User";
import { PasswordResetToken } from "@/models/PasswordResetToken";

const NO_STORE = { "Cache-Control": "no-store" };
const INVALID_LINK = "Lien invalide ou expiré. Demandez un nouveau lien.";
const INVALID_LINK_CODE = "INVALID_LINK";
const UNAVAILABLE = "Service momentanément indisponible. Réessayez plus tard ou demandez un nouveau lien.";

const REDEEMABLE_PURPOSES = new Set(["reset", "invitation"]);

const PASSWORD_REQUIRED = "Le nouveau mot de passe est requis";

// Bornes de saisie : le jeton fait 43 caractères ; bcrypt ne lit de toute façon que 72 octets.
const resetSchema = z.object({
  token: z.string({ required_error: INVALID_LINK, invalid_type_error: INVALID_LINK }).max(512, INVALID_LINK),
  newPassword: z
    .string({ required_error: PASSWORD_REQUIRED, invalid_type_error: PASSWORD_REQUIRED })
    .min(6, "Le nouveau mot de passe doit contenir au moins 6 caractères")
    .max(128, "Le mot de passe ne doit pas dépasser 128 caractères"),
});

export async function POST(req: NextRequest) {
  let limit: RateLimitResult;
  try {
    limit = await consumeRateLimit("reset-ip", clientIp(req), { limit: 20, windowMs: 3_600_000 });
  } catch (error) {
    // Échec fermé : sans limiteur, aucune tentative de jeton n'est acceptée.
    console.error("[reset-password] limiteur indisponible :", error instanceof Error ? error.name : "erreur");
    return NextResponse.json({ error: UNAVAILABLE }, { status: 503, headers: NO_STORE });
  }
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez plus tard." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) {
    // Format invalide (mot de passe trop court…) : le jeton n'est pas consommé.
    const passwordIssue = parsed.error.issues.find((i) => i.path[0] === "newPassword");
    return NextResponse.json(
      passwordIssue
        ? { error: passwordIssue.message }
        : { error: INVALID_LINK, code: INVALID_LINK_CODE },
      { status: 400, headers: NO_STORE }
    );
  }

  let user: { nom: string; email: string } | null = null;
  let purpose: string | null = null;
  try {
    const consumed = await consumeResetToken(parsed.data.token);
    if (!consumed || !REDEEMABLE_PURPOSES.has(consumed.purpose)) {
      return NextResponse.json({ error: INVALID_LINK, code: INVALID_LINK_CODE }, { status: 400, headers: NO_STORE });
    }

    await connectDB();
    const hash = await bcrypt.hash(parsed.data.newPassword, 10);
    const updated = await User.findByIdAndUpdate(
      consumed.userId,
      { $set: { motDePasseHash: hash, mustChangePassword: false, passwordChangedAt: new Date() } },
      { new: true }
    ).select("nom email");
    if (updated) {
      user = { nom: updated.nom, email: updated.email };
      purpose = consumed.purpose;
      // Choisir un mot de passe révoque tous les autres liens en attente (un compte peut avoir à la
      // fois une invitation et une réinitialisation) : une invitation mal acheminée ne doit pas
      // rester utilisable ensuite. Le jeton consommé reste en base, avec usedAt renseigné.
      await PasswordResetToken.deleteMany({ userId: consumed.userId, usedAt: null });
    }
  } catch (error) {
    // Jamais de 500 par défaut : Next journaliserait l'erreur complète (URI Mongo possible).
    console.error("[reset-password] indisponible :", error instanceof Error ? error.name : "erreur");
    return NextResponse.json({ error: UNAVAILABLE }, { status: 503, headers: NO_STORE });
  }

  if (!user) {
    return NextResponse.json({ error: INVALID_LINK, code: INVALID_LINK_CODE }, { status: 400, headers: NO_STORE });
  }

  // L'e-mail « mot de passe modifié » n'a de sens que pour un compte existant : pas après l'activation
  // d'une invitation, où le titulaire choisit son tout premier mot de passe.
  if (purpose === "reset") {
    const recipient = { nom: user.nom, email: user.email };
    await runAfterResponse(async () => {
      await sendPasswordChangedMail(recipient);
    });
  }

  return NextResponse.json({ message: "Mot de passe modifié. Vous pouvez vous connecter." }, { headers: NO_STORE });
}
