// src/backend/operations/http/detail.controleur.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/backend/comptes";
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { casDUsageOperations } from "../composition";
import { versActeur } from "./acteur";
import { versReponseErreur } from "./erreurs-http";
import { operationSchema, versSaisieOperation } from "./operation.schema";
import { versReponseOperation } from "./presentation";
import { versReponseOperationClient } from "./presentation";
import { isClientUser } from "@/shared/acces/permissions";
import { obtenirUniteQuantiteGlobale } from "@/backend/identite-entreprise";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const acteur = versActeur(auth);

  // Ordre historique : le refus « chauffeur sans équipe » (403) précède le contrôle de l'identifiant (400).
  try {
    casDUsageOperations.verifierAccesLecture(acteur);
  } catch (erreur) {
    return versReponseErreur(erreur);
  }

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  try {
    const operation = await casDUsageOperations.obtenir(acteur, id);
    return NextResponse.json(
      isClientUser(auth.role) ? versReponseOperationClient(operation) : versReponseOperation(operation)
    );
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  const body = await req.json();
  const parsed = operationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const saisie = versSaisieOperation(parsed.data);
    saisie.uniteQuantite = (await obtenirUniteQuantiteGlobale()) ?? saisie.uniteQuantite;
    const operation = await casDUsageOperations.modifier(id, saisie);
    return NextResponse.json(versReponseOperation(operation));
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  try {
    await casDUsageOperations.supprimer(id);
    return NextResponse.json({ success: true });
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}
