import { NextRequest, NextResponse } from "next/server";
import { requireInternalAuth } from "@/backend/comptes";
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { casDUsageRecurrences } from "../composition";
import { RecurrenceIntrouvable } from "../domain/erreurs";
import { versReponseRecurrence } from "./presentation";
import { recurrenceSchema, versSaisieRecurrence } from "./recurrence.schema";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Traduit l'erreur métier en 404 ; toute autre erreur remonte telle quelle. */
function versReponseErreur(erreur: unknown): NextResponse {
  if (erreur instanceof RecurrenceIntrouvable) {
    return NextResponse.json({ error: erreur.message }, { status: 404 });
  }
  throw erreur;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const auth = await requireInternalAuth();
  if (auth.error) return auth.error;

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  try {
    return NextResponse.json(versReponseRecurrence(await casDUsageRecurrences.obtenir(id)));
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const auth = await requireInternalAuth(true);
  if (auth.error) return auth.error;

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  const body = await req.json();

  const parsed = recurrenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const recurrence = await casDUsageRecurrences.modifier(id, versSaisieRecurrence(parsed.data));
    return NextResponse.json(versReponseRecurrence(recurrence));
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const auth = await requireInternalAuth(true);
  if (auth.error) return auth.error;

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  try {
    await casDUsageRecurrences.supprimer(id);
    return NextResponse.json({ message: "Récurrence supprimée avec succès" });
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}
