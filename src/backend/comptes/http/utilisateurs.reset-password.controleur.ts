import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "./acteur";
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { UtilisateurIntrouvable } from "../domain/erreurs";
import { casDUsageUtilisateurs } from "../composition";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Régénère le mot de passe temporaire d'un utilisateur (administrateur uniquement).
 * Le mot de passe n'est renvoyé qu'une fois, dans `generatedPassword` : il est affiché à
 * l'administrateur pour transmission de vive voix, jamais journalisé ni envoyé par e-mail
 * (l'envoi d'un lien passe par la route send-reset-link).
 * `passwordChangedAt` invalide les sessions déjà ouvertes de l'utilisateur ciblé
 * (au plus 5 minutes plus tard, cf. REFRESH_INTERVAL_MS). Cela vaut aussi lorsqu'un administrateur
 * régénère son PROPRE mot de passe : sa session prend fin dans les 5 minutes et il doit se reconnecter.
 * Les liens d'invitation ou de réinitialisation en attente sont révoqués.
 */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  try {
    const { motDePasseGenere } = await casDUsageUtilisateurs.regenererMotDePasse(id);
    // Réponse contenant un secret : ne jamais la mettre en cache.
    return NextResponse.json({ generatedPassword: motDePasseGenere }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof UtilisateurIntrouvable) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
