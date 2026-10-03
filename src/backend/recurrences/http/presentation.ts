import type { Recurrence, Reference } from "../domain/recurrence";

/** Relation → forme JSON historique : identifiant brut, `null`, ou document peuplé sous `_id`. */
function versReferenceJson(reference: Reference<{ id: string }> | undefined) {
  if (reference == null || typeof reference === "string") return reference;
  const { id, ...champs } = reference;
  return { _id: id, ...champs };
}

/** Forme JSON historique de l'API (document Mongoose sérialisé) ; les clés `undefined` sont omises par JSON. */
export function versReponseRecurrence(recurrence: Recurrence) {
  return {
    _id: recurrence.id,
    clientId: versReferenceJson(recurrence.clientId),
    siteId: versReferenceJson(recurrence.siteId),
    natureIntervention: recurrence.natureIntervention,
    frequence: recurrence.frequence,
    jourSemaine: recurrence.jourSemaine,
    jourMois: recurrence.jourMois,
    intervalleJours: recurrence.intervalleJours,
    heurePrevue: recurrence.heurePrevue,
    dureeEstimeeMinutes: recurrence.dureeEstimeeMinutes,
    equipeId: versReferenceJson(recurrence.equipeId),
    vehiculeId: versReferenceJson(recurrence.vehiculeId),
    equipementIds: recurrence.equipementIds.map(versReferenceJson),
    informationsParticulieres: recurrence.informationsParticulieres,
    active: recurrence.active,
    derniereGeneration: recurrence.derniereGeneration,
    createdAt: recurrence.createdAt,
    updatedAt: recurrence.updatedAt,
    __v: recurrence.revision,
  };
}
