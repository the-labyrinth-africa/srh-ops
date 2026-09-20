import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { User } from "@/models/User";
import { PasswordResetToken } from "@/models/PasswordResetToken";
import { changePasswordSchema } from "@/lib/validators/user";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(false, { allowMustChangePassword: true });
  if (auth.error) return auth.error;

  const body = await req.json();
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { currentPassword, newPassword } = parsed.data;

  await connectDB();
  const user = await User.findById(auth.user.id);
  if (!user) {
    return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
  }

  const valid = await bcrypt.compare(currentPassword, user.motDePasseHash);
  if (!valid) {
    return NextResponse.json({ error: "Mot de passe actuel incorrect" }, { status: 400 });
  }

  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: "Le nouveau mot de passe doit être différent de l'ancien" },
      { status: 400 }
    );
  }

  // Changement volontaire : on ne pose volontairement PAS `passwordChangedAt`. Cette date
  // invalide les sessions ouvertes ; l'utilisateur doit conserver la sienne (il vient de
  // s'authentifier avec son mot de passe actuel). Seules les réinitialisations l'utilisent.
  const newHash = await bcrypt.hash(newPassword, 10);
  await User.updateOne(
    { _id: user._id },
    { $set: { motDePasseHash: newHash, mustChangePassword: false } }
  );

  // Un mot de passe choisi révoque les liens en attente (invitation de repli comprise) : un jeton
  // de 72 h orphelin ne doit pas survivre au changement fait par l'utilisateur lui-même.
  await PasswordResetToken.deleteMany({ userId: user._id, usedAt: null });

  return NextResponse.json({ message: "Mot de passe modifié avec succès" });
}
