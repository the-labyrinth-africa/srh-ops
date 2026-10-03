import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/backend/comptes";
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { casDUsageOperations, casDUsageRapport } from "../composition";
import { versActeur } from "./acteur";
import { versReponseErreur } from "./erreurs-http";

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
    const { contenu, nomFichier } = await casDUsageRapport.generer(acteur, id);
    return new NextResponse(Buffer.from(contenu), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nomFichier}"`,
      },
    });
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}
