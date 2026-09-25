import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import { requireAuth } from "@/lib/api-auth";
import { User } from "@/backend/comptes/infrastructure/mongoose/utilisateur.model";
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { generateRandomPassword } from "@/lib/email";
import { PasswordResetToken } from "@/backend/comptes/infrastructure/mongoose/jeton.model";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Régénère le mot de passe temporaire d'un utilisateur (administrateur uniquement).
 * Le mot de passe n'est renvoyé qu'une fois, dans `generatedPassword` : il est affiché à
 * l'administrateur pour transmission de vive voix, jamais journalisé ni envoyé par e-mail
 * (l'envoi d'un lien passe par la route send-reset-link).
 * `passwordChangedAt` invalide les sessions déjà ouvertes de l'utilisateur ciblé
 * (au plus 5 minutes plus tard, cf. REFRESH_INTERVAL_MS). Cela vaut aussi lorsqu'un administrateur
 * régénère son PROPRE mot de passe : sa session prend fin dans les 5 minutes et il doit se reconnecter.
 * Les liens d'invitation ou de réinitialisation en attente sont révoqués.
 */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  await connectDB();

  const generatedPassword = generateRandomPassword(10);
  const hash = await bcrypt.hash(generatedPassword, 10);

  const updated = await User.findByIdAndUpdate(
    id,
    { motDePasseHash: hash, mustChangePassword: true, passwordChangedAt: new Date() },
    { new: true }
  ).select("_id");

  if (!updated) {
    return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
  }

  // Régénérer le mot de passe révoque aussi les liens en attente (invitation comprise) : un lien
  // mal acheminé (adresse erronée) ne doit pas rester utilisable après la régénération.
  await PasswordResetToken.deleteMany({ userId: id, usedAt: null });

  // Réponse contenant un secret : ne jamais la mettre en cache.
  return NextResponse.json({ generatedPassword }, { headers: { "Cache-Control": "no-store" } });
}
