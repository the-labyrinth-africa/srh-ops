import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth"; // transitoire : migre avec 3c
import { UtilisateurIntrouvable, LimiteDeDebitAtteinte } from "../domain/erreurs";
import { casDUsageEmailDeTest } from "../composition";

const NO_STORE = { "Cache-Control": "no-store" };
const UNAVAILABLE = "Service momentanément indisponible. Réessayez plus tard.";

/** Envoie un e-mail de test à l'adresse du compte administrateur connecté. */
export async function POST() {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403, headers: NO_STORE });
  }

  let resultat;
  try {
    resultat = await casDUsageEmailDeTest.envoyer(auth.user.id);
  } catch (error) {
    if (error instanceof LimiteDeDebitAtteinte) {
      return NextResponse.json(
        { error: "Trop d'e-mails de test. Réessayez plus tard." },
        { status: 429, headers: { ...NO_STORE, "Retry-After": String(error.retryApresSecondes) } }
      );
    }
    if (error instanceof UtilisateurIntrouvable) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404, headers: NO_STORE });
    }
    // Jamais de 500 par défaut : Next journaliserait l'erreur complète (URI Mongo possible).
    console.error("[mail-test] limiteur indisponible :", error instanceof Error ? error.name : "erreur");
    return NextResponse.json({ error: UNAVAILABLE }, { status: 503, headers: NO_STORE });
  }

  return NextResponse.json(resultat, { status: resultat.ok ? 200 : 502, headers: NO_STORE });
}
