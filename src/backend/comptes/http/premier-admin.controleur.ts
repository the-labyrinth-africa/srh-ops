import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "./acteur";
import { casDUsageUtilisateurs } from "../composition";
import { EmailDejaUtilise, PremierAdministrateurDejaCree, UsernameDejaUtilise } from "../domain/erreurs";
import { premierAdminCreateSchema } from "./utilisateur.schema";
import { versReponseUtilisateur } from "./presentation";

function accesSuperadminRequis(role: string) {
  return role === "superadmin"
    ? null
    : NextResponse.json({ error: "Accès réservé au super administrateur de la plateforme." }, { status: 403 });
}

export async function GET() {
  const auth = await requireAuth(false, { allowSuperadmin: true });
  if (auth.error) return auth.error;
  const acces = accesSuperadminRequis(auth.user.role);
  if (acces) return acces;

  return NextResponse.json(
    { adminInitialCree: await casDUsageUtilisateurs.premierAdministrateurCree() },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(false, { allowSuperadmin: true });
  if (auth.error) return auth.error;
  const acces = accesSuperadminRequis(auth.user.role);
  if (acces) return acces;

  const body: unknown = await request.json();
  const parsed = premierAdminCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const saisie = {
    ...parsed.data,
    role: "admin" as const,
    clientId: undefined,
    equipeId: undefined,
  };
  let resultat;
  try {
    resultat = await casDUsageUtilisateurs.creerPremierAdministrateur(saisie);
  } catch (error) {
    if (
      error instanceof EmailDejaUtilise ||
      error instanceof UsernameDejaUtilise ||
      error instanceof PremierAdministrateurDejaCree
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  const { utilisateur, invitationEnvoyee, motDePasseGenere } = resultat;
  const responseBody = invitationEnvoyee
    ? { user: versReponseUtilisateur(utilisateur), invitation: "sent", message: `Invitation envoyée à ${utilisateur.email}.` }
    : {
        user: versReponseUtilisateur(utilisateur),
        invitation: "not_sent",
        temporaryPassword: motDePasseGenere,
        message: "L'e-mail n'a pas pu être envoyé : communiquez le mot de passe temporaire à l'Admin Ops.",
      };

  return NextResponse.json(responseBody, {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}
