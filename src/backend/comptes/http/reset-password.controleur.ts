import { NextRequest, NextResponse } from "next/server";
import { LimiteDeDebitAtteinte, LienInvalideOuExpire } from "../domain/erreurs";
import { resetPasswordSchema, INVALID_LINK } from "./mot-de-passe.schema";
import { adresseClient, casDUsageReinitialisation } from "../composition";

const NO_STORE = { "Cache-Control": "no-store" };
const INVALID_LINK_CODE = "INVALID_LINK";
const UNAVAILABLE = "Service momentanément indisponible. Réessayez plus tard ou demandez un nouveau lien.";

/** Route publique (aucune garde d'authentification), token transmis dans le corps. */
export async function POST(req: NextRequest) {
  const ip = adresseClient(req);

  // Limiteur vérifié AVANT toute lecture du corps — ordre exact de la route d'origine (à l'inverse
  // de « mot de passe oublié », qui valide le corps avant de limiter) : un lot de corps mal formés
  // doit quand même consommer le débit, pas le contourner.
  try {
    await casDUsageReinitialisation.verifierLimiteDeDebit(ip);
  } catch (error) {
    if (error instanceof LimiteDeDebitAtteinte) {
      return NextResponse.json(
        { error: "Trop de tentatives. Réessayez plus tard." },
        { status: 429, headers: { ...NO_STORE, "Retry-After": String(error.retryApresSecondes) } }
      );
    }
    // Échec fermé : sans limiteur, aucune tentative de jeton n'est acceptée.
    console.error("[reset-password] indisponible :", error instanceof Error ? error.name : "erreur");
    return NextResponse.json({ error: UNAVAILABLE }, { status: 503, headers: NO_STORE });
  }

  const body = await req.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    // Format invalide (mot de passe trop court…) : le jeton n'est pas consommé (le cas d'usage
    // n'est même pas appelé).
    const passwordIssue = parsed.error.issues.find((i) => i.path[0] === "newPassword");
    return NextResponse.json(
      passwordIssue ? { error: passwordIssue.message } : { error: INVALID_LINK, code: INVALID_LINK_CODE },
      { status: 400, headers: NO_STORE }
    );
  }

  try {
    await casDUsageReinitialisation.reinitialiser(parsed.data.token, parsed.data.newPassword);
  } catch (error) {
    if (error instanceof LienInvalideOuExpire) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400, headers: NO_STORE });
    }
    // Jamais de 500 par défaut : Next journaliserait l'erreur complète (URI Mongo possible).
    console.error("[reset-password] indisponible :", error instanceof Error ? error.name : "erreur");
    return NextResponse.json({ error: UNAVAILABLE }, { status: 503, headers: NO_STORE });
  }

  return NextResponse.json({ message: "Mot de passe modifié. Vous pouvez vous connecter." }, { headers: NO_STORE });
}
