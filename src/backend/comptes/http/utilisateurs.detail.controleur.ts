import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "./acteur";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { UtilisateurIntrouvable, SuppressionDeSoiInterdite } from "../domain/erreurs";
import { casDUsageUtilisateurs, erreurDeRattachement } from "../composition";
import { userUpdateSchema, versSaisieModification } from "./utilisateur.schema";
import { versReponseUtilisateur } from "./presentation";

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

  try {
    const utilisateur = await casDUsageUtilisateurs.obtenir(id);
    return NextResponse.json(versReponseUtilisateur(utilisateur));
  } catch (error) {
    if (error instanceof UtilisateurIntrouvable) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
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

  await connectDB();
  const scopeError = await erreurDeRattachement({ clientId: parsed.data.clientId, equipeId: parsed.data.equipeId });
  if (scopeError) return NextResponse.json({ error: scopeError }, { status: 400 });

  try {
    const utilisateur = await casDUsageUtilisateurs.modifier(id, versSaisieModification(parsed.data));
    return NextResponse.json(versReponseUtilisateur(utilisateur));
  } catch (error) {
    if (error instanceof UtilisateurIntrouvable) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
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

  try {
    // Refus de se supprimer soi-même AVANT la tentative de suppression (géré par le cas d'usage).
    await casDUsageUtilisateurs.supprimer(id, auth.user.id);
    return NextResponse.json({ message: "Utilisateur supprimé avec succès" });
  } catch (error) {
    if (error instanceof SuppressionDeSoiInterdite) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof UtilisateurIntrouvable) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
