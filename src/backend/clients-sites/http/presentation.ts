import type { Client } from "../domain/client";

/** Forme JSON historique de l'API (document Mongoose sérialisé). */
export function versReponseClient(client: Client) {
  return {
    _id: client.id,
    nom: client.nom,
    contact: client.contact,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
    __v: client.revision,
  };
}
