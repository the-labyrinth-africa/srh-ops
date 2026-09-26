import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "./acteur";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import { findScopeError } from "@/lib/users/scope"; // transitoire : hors périmètre de ce sous-plan
import type { UserRole } from "@/shared/acces/roles";
import { EmailDejaUtilise, UsernameDejaUtilise } from "../domain/erreurs";
import { casDUsageUtilisateurs } from "../composition";
import { userCreateSchema, versSaisieCreation } from "./utilisateur.schema";
import { versReponseUtilisateur } from "./presentation";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const roleParam = sp.get("role");
  const role = roleParam ? (roleParam as UserRole) : undefined;

  const utilisateurs = await casDUsageUtilisateurs.lister(role);
  return NextResponse.json(utilisateurs.map(versReponseUtilisateur));
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = userCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await connectDB();
  const scopeError = await findScopeError({ clientId: parsed.data.clientId, equipeId: parsed.data.equipeId });
  if (scopeError) return NextResponse.json({ error: scopeError }, { status: 400 });

  let resultat;
  try {
    resultat = await casDUsageUtilisateurs.creer(versSaisieCreation(parsed.data));
  } catch (error) {
    if (error instanceof EmailDejaUtilise || error instanceof UsernameDejaUtilise) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  const { utilisateur, invitationEnvoyee, motDePasseGenere } = resultat;
  // Le mot de passe temporaire n'est renvoyé qu'en repli (e-mail non envoyé) ; jamais dans `message`.
  const responseBody = invitationEnvoyee
    ? { user: versReponseUtilisateur(utilisateur), invitation: "sent", message: `Invitation envoyée à ${utilisateur.email}.` }
    : {
        user: versReponseUtilisateur(utilisateur),
        invitation: "not_sent",
        generatedPassword: motDePasseGenere,
        message: "L'e-mail n'a pas pu être envoyé : communiquez le mot de passe temporaire à l'utilisateur.",
      };

  // Réponse pouvant contenir un secret : ne jamais la mettre en cache.
  return NextResponse.json(responseBody, { status: 201, headers: { "Cache-Control": "no-store" } });
}
