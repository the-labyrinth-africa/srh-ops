import { NextResponse } from "next/server";
import {
  ChauffeurSansEquipe,
  CompteClientSansPerimetre,
  ConflitAffectation,
  FormatPhotoInvalide,
  OperationHorsEquipe,
  OperationIntrouvable,
  PhotoRequise,
  PhotoTropLourde,
  PhotosTropLourdes,
  TransitionInterdite,
  TropDePhotos,
  UrlPhotoRequise,
} from "../domain/erreurs";

type ClasseErreur = abstract new (...args: never[]) => Error;

/** Code HTTP de chaque erreur métier ; le corps est toujours `{ error: <message de l'erreur> }`. */
const CODES: [ClasseErreur, number][] = [
  [ChauffeurSansEquipe, 403],
  [CompteClientSansPerimetre, 403],
  [OperationHorsEquipe, 403],
  [OperationIntrouvable, 404],
  [TransitionInterdite, 400],
  [PhotoRequise, 400],
  [FormatPhotoInvalide, 400],
  [TropDePhotos, 400],
  [UrlPhotoRequise, 400],
  [PhotoTropLourde, 413],
  [PhotosTropLourdes, 413],
];

/** Traduit une erreur métier en réponse HTTP ; toute autre erreur remonte telle quelle. */
export function versReponseErreur(erreur: unknown): NextResponse {
  if (erreur instanceof ConflitAffectation) {
    return NextResponse.json({ error: erreur.message, conflicts: erreur.conflits }, { status: 409 });
  }
  for (const [Classe, status] of CODES) {
    if (erreur instanceof Classe) return NextResponse.json({ error: erreur.message }, { status });
  }
  throw erreur;
}
