import { NextRequest, NextResponse } from "next/server";
import { requireTerrainWrite } from "@/backend/comptes";
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { casDUsageTerrain } from "../composition";
import { versActeur } from "./acteur";
import { versReponseErreur } from "./erreurs-http";
import { statusUpdateSchema, versDemandeStatut } from "./operation.schema";
import { versReponseOperation } from "./presentation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireTerrainWrite();
  if (auth.error) return auth.error;
  const acteur = versActeur(auth);

  // Ordre historique : le refus « chauffeur sans équipe » (403) précède le contrôle de l'identifiant (400).
  try {
    casDUsageTerrain.verifierAccesTerrain(acteur);
  } catch (erreur) {
    return versReponseErreur(erreur);
  }

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  const body = await req.json();
  const parsed = statusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const operation = await casDUsageTerrain.changerStatut(acteur, id, versDemandeStatut(parsed.data));
    return NextResponse.json(versReponseOperation(operation));
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}
