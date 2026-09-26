import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "./acteur";
import { UtilisateurIntrouvable, MotDePasseActuelIncorrect, NouveauMotDePasseIdentique } from "../domain/erreurs";
import { changePasswordSchema } from "./mot-de-passe.schema";
import { casDUsageChangementMotDePasse } from "../composition";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(false, { allowMustChangePassword: true });
  if (auth.error) return auth.error;

  const body = await req.json();
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { currentPassword, newPassword } = parsed.data;

  try {
    await casDUsageChangementMotDePasse.changer(auth.user.id, currentPassword, newPassword);
  } catch (error) {
    if (error instanceof UtilisateurIntrouvable) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
    }
    if (error instanceof MotDePasseActuelIncorrect) {
      return NextResponse.json({ error: "Mot de passe actuel incorrect" }, { status: 400 });
    }
    if (error instanceof NouveauMotDePasseIdentique) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  return NextResponse.json({ message: "Mot de passe modifié avec succès" });
}
