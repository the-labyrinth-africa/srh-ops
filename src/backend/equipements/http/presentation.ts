import type { Equipement } from "../domain/equipement";

/** Forme JSON historique de l'API (document Mongoose sérialisé). */
export function versReponse(equipement: Equipement) {
  return {
    _id: equipement.id,
    nom: equipement.nom,
    type: equipement.type,
    disponibilite: equipement.disponibilite,
    createdAt: equipement.createdAt,
    updatedAt: equipement.updatedAt,
    __v: equipement.revision,
  };
}
