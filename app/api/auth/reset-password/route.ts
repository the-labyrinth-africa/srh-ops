import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { consumeRateLimit, clientIp, type RateLimitResult } from "@/lib/rate-limit";
import { runAfterResponse } from "@/lib/run-after";
import { consumeResetToken } from "@/lib/auth/reset-token";
import { sendPasswordChangedMail } from "@/lib/auth/account-mail";
import { changePasswordSchema } from "@/lib/validators/user";
import { User } from "@/models/User";

const NO_STORE = { "Cache-Control": "no-store" };
const INVALID_LINK = "Lien invalide ou expiré. Demandez un nouveau lien.";

const resetSchema = z.object({
  token: z.string(),
  newPassword: changePasswordSchema.shape.newPassword,
});

export async function POST(req: NextRequest) {
  let limit: RateLimitResult;
  try {
    limit = await consumeRateLimit("reset-ip", clientIp(req), { limit: 20, windowMs: 3_600_000 });
  } catch (error) {
    // Échec fermé : sans limiteur, aucune tentative de jeton n'est acceptée.
    console.error("[reset-password] limiteur indisponible :", error instanceof Error ? error.name : "erreur");
    return NextResponse.json(
      { error: "Service momentanément indisponible. Réessayez plus tard." },
      { status: 503, headers: NO_STORE }
    );
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
      { error: passwordIssue?.message ?? INVALID_LINK },
      { status: 400, headers: NO_STORE }
    );
  }

  const consumed = await consumeResetToken(parsed.data.token);
  if (!consumed) {
    return NextResponse.json({ error: INVALID_LINK }, { status: 400, headers: NO_STORE });
  }

  await connectDB();
  const hash = await bcrypt.hash(parsed.data.newPassword, 10);
  const user = await User.findByIdAndUpdate(
    consumed.userId,
    { $set: { motDePasseHash: hash, mustChangePassword: false, passwordChangedAt: new Date() } },
    { new: true }
  ).select("nom email");

  if (!user) {
    return NextResponse.json({ error: INVALID_LINK }, { status: 400, headers: NO_STORE });
  }

  await runAfterResponse(async () => {
    await sendPasswordChangedMail({ nom: user.nom, email: user.email });
  });

  return NextResponse.json({ message: "Mot de passe modifié. Vous pouvez vous connecter." }, { headers: NO_STORE });
}
