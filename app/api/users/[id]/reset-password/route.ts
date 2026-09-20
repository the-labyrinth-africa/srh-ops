import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { User } from "@/models/User";
import { guardObjectId } from "@/lib/mongo-id";
import { generateRandomPassword } from "@/lib/email";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Régénère le mot de passe temporaire d'un utilisateur (administrateur uniquement).
 * Le mot de passe n'est renvoyé qu'une fois, dans `generatedPassword` ; il n'est
 * ni journalisé, ni envoyé par e-mail (aucun transport n'est configuré).
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
    { motDePasseHash: hash, mustChangePassword: true },
    { new: true }
  ).select("_id");

  if (!updated) {
    return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
  }

  // Réponse contenant un secret : ne jamais la mettre en cache.
  return NextResponse.json({ generatedPassword }, { headers: { "Cache-Control": "no-store" } });
}
