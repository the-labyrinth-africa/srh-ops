// src/backend/operations/http/planning.controleur.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/backend/comptes";
import { casDUsageOperations } from "../composition";
import type { FiltreOperations } from "../domain/operation";
import { versActeur } from "./acteur";
import { versReponseErreur } from "./erreurs-http";
import { versEvenementPlanning } from "./presentation";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const sp = req.nextUrl.searchParams;
  const dateDebut = sp.get("dateDebut");
  const dateFin = sp.get("dateFin");

  // Seules les bornes de date sont lues ici : le planning n'a jamais filtré par client, équipe ou statut.
  const filtre: FiltreOperations = {};
  if (dateDebut) filtre.dateDebut = new Date(dateDebut);
  if (dateFin) filtre.dateFin = new Date(dateFin);

  try {
    const elements = await casDUsageOperations.planning(versActeur(auth), filtre);
    return NextResponse.json(elements.map(versEvenementPlanning));
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}
