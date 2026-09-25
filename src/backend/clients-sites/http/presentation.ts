import type { Client } from "../domain/client";
import type { Site, SiteAvecClientPeuple } from "../domain/site";

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

function versClientJson(clientId: SiteAvecClientPeuple["clientId"]) {
  return typeof clientId === "string" ? clientId : { _id: clientId.id, nom: clientId.nom };
}

/** Forme JSON historique de l'API pour une lecture (liste/détail), `clientId` peuplé. */
export function versReponseSitePeuple(site: SiteAvecClientPeuple) {
  return {
    _id: site.id,
    clientId: versClientJson(site.clientId),
    nom: site.nom,
    adresse: site.adresse,
    localisation: site.localisation,
    typeDechets: site.typeDechets,
    observations: site.observations,
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
    __v: site.revision,
  };
}

/** Forme JSON historique de l'API pour une écriture (création/modification), `clientId` non peuplé. */
export function versReponseSite(site: Site) {
  return {
    _id: site.id,
    clientId: site.clientId,
    nom: site.nom,
    adresse: site.adresse,
    localisation: site.localisation,
    typeDechets: site.typeDechets,
    observations: site.observations,
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
    __v: site.revision,
  };
}
