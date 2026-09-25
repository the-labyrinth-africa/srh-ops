import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import { requireAuth } from "@/lib/api-auth";
import { User } from "@/backend/comptes/infrastructure/mongoose/utilisateur.model";
import { userUpdateSchema } from "@/lib/validators/user";
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { findScopeError } from "@/lib/users/scope";
import { PasswordResetToken } from "@/backend/comptes/infrastructure/mongoose/jeton.model";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  if (auth.user.role !== "admin" && auth.user.id !== id) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  await connectDB();
  const user = await User.findById(id)
    .select("-motDePasseHash")
    .populate("clientId", "nom")
    .populate("equipeId", "nom")
    .lean();

  if (!user) {
    return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
  }

  return NextResponse.json(user);
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  const body = await req.json();

  const parsed = userUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { nom, email, role, telephone, clientId, equipeId } = parsed.data;

  await connectDB();

  const scopeError = await findScopeError({ clientId, equipeId });
  if (scopeError) return NextResponse.json({ error: scopeError }, { status: 400 });

  // Mongoose ignore les clés `undefined` : sans `$unset`, l'ancien rattachement resterait en base.
  const set: Record<string, unknown> = { nom, email: email.toLowerCase(), role, telephone };
  const unset: Record<string, 1> = {};
  if (clientId) set.clientId = clientId; else unset.clientId = 1;
  if (equipeId) set.equipeId = equipeId; else unset.equipeId = 1;

  // Adresse actuelle, pour révoquer les liens envoyés à l'ancienne adresse si elle change.
  const previous = await User.findById(id).select("email");

  const updated = await User.findByIdAndUpdate(
    id,
    Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set },
    { new: true }
  )
    .select("-motDePasseHash")
    .populate("clientId", "nom")
    .populate("equipeId", "nom")
    .lean();

  if (!updated) {
    return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
  }

  if (previous && previous.email.toLowerCase() !== email.toLowerCase()) {
    await PasswordResetToken.deleteMany({ userId: id, usedAt: null });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  await connectDB();

  // Ne pas permettre de supprimer son propre compte
  if (auth.user.id === id) {
    return NextResponse.json({ error: "Impossible de supprimer votre propre compte" }, { status: 400 });
  }

  const deleted = await User.findByIdAndDelete(id);
  if (!deleted) {
    return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
  }

  return NextResponse.json({ message: "Utilisateur supprimé avec succès" });
}
