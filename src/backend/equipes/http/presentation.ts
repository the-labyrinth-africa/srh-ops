import type { Equipe } from "../domain/equipe";

/** Forme JSON historique de l'API (document Mongoose sérialisé). */
export function versReponse(equipe: Equipe) {
  return {
    _id: equipe.id,
    nom: equipe.nom,
    membres: equipe.membres,
    disponibilite: equipe.disponibilite,
    createdAt: equipe.createdAt,
    updatedAt: equipe.updatedAt,
    __v: equipe.revision,
  };
}
