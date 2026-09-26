import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "./acteur";
import { isValidObjectId } from "@/backend/platform/http/identifiants";
import { UtilisateurIntrouvable } from "../domain/erreurs";
import { casDUsageUtilisateurs } from "../composition";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const NO_STORE = { "Cache-Control": "no-store" };
const UNAVAILABLE = "Service momentanément indisponible. Réessayez plus tard.";

/** Envoie à l'utilisateur un lien de réinitialisation (administrateur uniquement). Ne modifie pas le mot de passe. */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403, headers: NO_STORE });
  }

  const { id } = await params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Identifiant invalide" }, { status: 400, headers: NO_STORE });
  }

  let resultat;
  try {
    resultat = await casDUsageUtilisateurs.envoyerLienDeReinitialisation(id);
  } catch (error) {
    if (error instanceof UtilisateurIntrouvable) {
      return NextResponse.json({ error: error.message }, { status: 404, headers: NO_STORE });
    }
    // Jamais de 500 par défaut : Next journaliserait l'erreur complète (URI Mongo possible).
    console.error("[send-reset-link] limiteur indisponible :", error instanceof Error ? error.name : "erreur");
    return NextResponse.json({ error: UNAVAILABLE }, { status: 503, headers: NO_STORE });
  }

  if (resultat.statut === "limite_atteinte") {
    return NextResponse.json(
      { error: "Trop de liens envoyés à ce compte. Réessayez plus tard." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(resultat.retryApresSecondes) } }
    );
  }

  return resultat.statut === "envoye"
    ? NextResponse.json({ sent: true }, { headers: NO_STORE })
    : NextResponse.json({ sent: false, reason: resultat.motif }, { status: 502, headers: NO_STORE });
}
