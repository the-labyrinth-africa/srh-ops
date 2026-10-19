import type { DemandePublique } from "../domain/demande";

export function versDemandePubliqueJson(demande: DemandePublique) {
  return {
    _id: demande.id,
    nomClient: demande.nomClient,
    nomContact: demande.nomContact,
    email: demande.email,
    telephone: demande.telephone,
    nomSite: demande.nomSite,
    adresseSite: demande.adresseSite,
    natureIntervention: demande.natureIntervention,
    dateSouhaitee: demande.dateSouhaitee,
    informationsParticulieres: demande.informationsParticulieres,
    statut: demande.statut,
    operationId: demande.operationId,
    clientId: demande.clientId,
    siteId: demande.siteId,
    traiteePar: demande.traiteePar,
    traiteeLe: demande.traiteeLe,
    motifRefus: demande.motifRefus,
    createdAt: demande.createdAt,
    updatedAt: demande.updatedAt,
  };
}
