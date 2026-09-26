import { NextRequest, NextResponse } from "next/server";
import { LimiteDeDebitAtteinte } from "../domain/erreurs";
import { forgotPasswordSchema } from "./mot-de-passe.schema";
import { adresseClient, casDUsageMotDePasseOublie } from "../composition";

const NO_STORE = { "Cache-Control": "no-store" };

// Même réponse que le compte existe ou non : aucune énumération possible.
const GENERIC_MESSAGE =
  "Si un compte correspond à cet identifiant, un e-mail de réinitialisation vient d'être envoyé.";

function genericResponse() {
  return NextResponse.json({ message: GENERIC_MESSAGE }, { headers: NO_STORE });
}

/** Route publique (aucune garde d'authentification). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Identifiant requis" }, { status: 400, headers: NO_STORE });
  }

  const identifiant = parsed.data.identifier.trim().toLowerCase();
  const ip = adresseClient(req);

  try {
    // Recherche, jeton et envoi après la réponse (à l'intérieur du cas d'usage) : le temps de
    // réponse ne dépend pas de l'existence du compte.
    await casDUsageMotDePasseOublie.demander(identifiant, ip);
  } catch (error) {
    if (error instanceof LimiteDeDebitAtteinte) {
      return NextResponse.json(
        { error: "Trop de demandes. Réessayez plus tard." },
        { status: 429, headers: { ...NO_STORE, "Retry-After": String(error.retryApresSecondes) } }
      );
    }
    throw error;
  }

  // Réponse toujours identique que le compte existe ou non : aucune indication d'existence.
  return genericResponse();
}
