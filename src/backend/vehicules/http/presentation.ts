import type { Vehicule } from "../domain/vehicule";

/** Forme JSON historique de l'API (document Mongoose sérialisé). */
export function versReponse(vehicule: Vehicule) {
  return {
    _id: vehicule.id,
    identification: vehicule.identification,
    type: vehicule.type,
    capacite: vehicule.capacite,
    disponibilite: vehicule.disponibilite,
    createdAt: vehicule.createdAt,
    updatedAt: vehicule.updatedAt,
    __v: vehicule.revision,
  };
}
