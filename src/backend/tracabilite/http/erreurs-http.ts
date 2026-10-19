import { NextResponse } from "next/server";
import {
  IdentifiantSuiviDuplique,
  TraceabiliteAccesRefuse,
  TraceabiliteIntrouvable,
} from "../domain/erreurs";

export function versReponseErreurTracabilite(erreur: unknown): NextResponse {
  if (erreur instanceof IdentifiantSuiviDuplique) {
    return NextResponse.json({ error: erreur.message }, { status: 409 });
  }
  if (erreur instanceof TraceabiliteIntrouvable) {
    return NextResponse.json({ error: erreur.message }, { status: 404 });
  }
  if (erreur instanceof TraceabiliteAccesRefuse) {
    return NextResponse.json({ error: erreur.message }, { status: 403 });
  }
  throw erreur;
}
