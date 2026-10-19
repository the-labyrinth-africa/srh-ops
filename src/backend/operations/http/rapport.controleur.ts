import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireTerrainWrite } from "@/backend/comptes";
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { casDUsageOperations, casDUsageRapport } from "../composition";
import { versActeur } from "./acteur";
import { versReponseErreur } from "./erreurs-http";
import { rapportEmailSchema } from "./operation.schema";

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

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireTerrainWrite();
  if (auth.error) return auth.error;
  const acteur = versActeur(auth);

  try {
    casDUsageOperations.verifierAccesLecture(acteur);
  } catch (erreur) {
    return versReponseErreur(erreur);
  }

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  const rawBody = await req.text();
  let body: unknown = {};
  if (rawBody.trim()) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
    }
  }
  const parsed = rapportEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const resultat = await casDUsageRapport.envoyerParEmail(acteur, id, parsed.data.email);
    return NextResponse.json({
      ok: true,
      message: `Rapport envoyé avec succès à ${resultat.destinataire}`,
      destinataire: resultat.destinataire,
      nomFichier: resultat.nomFichier,
    });
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}
