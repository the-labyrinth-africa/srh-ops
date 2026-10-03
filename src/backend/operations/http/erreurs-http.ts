// src/backend/operations/http/erreurs-http.ts
import { NextResponse } from "next/server";
import { ChauffeurSansEquipe, ConflitAffectation, OperationIntrouvable } from "../domain/erreurs";

/** Traduit une erreur métier en réponse HTTP ; toute autre erreur remonte telle quelle. */
export function versReponseErreur(erreur: unknown): NextResponse {
  if (erreur instanceof ChauffeurSansEquipe) {
    return NextResponse.json({ error: erreur.message }, { status: 403 });
  }
  if (erreur instanceof OperationIntrouvable) {
    return NextResponse.json({ error: erreur.message }, { status: 404 });
  }
  if (erreur instanceof ConflitAffectation) {
    return NextResponse.json({ error: erreur.message, conflicts: erreur.conflits }, { status: 409 });
  }
  throw erreur;
}
