import { NextRequest, NextResponse } from "next/server";
import { requireTerrainWrite } from "@/backend/comptes";
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { casDUsageTerrain } from "../composition";
import { versActeur } from "./acteur";
import { versReponseErreur } from "./erreurs-http";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireTerrainWrite();
  if (auth.error) return auth.error;
  const acteur = versActeur(auth);

  try {
    casDUsageTerrain.verifierAccesTerrain(acteur);
  } catch (erreur) {
    return versReponseErreur(erreur);
  }

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  const body = await req.json();

  try {
    const photo = await casDUsageTerrain.ajouterPhoto(acteur, id, { photo: body.photo, nom: body.nom });
    return NextResponse.json({ photo }, { status: 201 });
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireTerrainWrite();
  if (auth.error) return auth.error;
  const acteur = versActeur(auth);

  try {
    casDUsageTerrain.verifierAccesTerrain(acteur);
  } catch (erreur) {
    return versReponseErreur(erreur);
  }

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  const body = await req.json();

  try {
    await casDUsageTerrain.retirerPhoto(acteur, id, body.url);
    return NextResponse.json({ success: true });
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}
