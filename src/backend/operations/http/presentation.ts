// src/backend/operations/http/presentation.ts
import type { OperationStatus } from "@/shared/operations/statuts";
import type { ElementPlanning } from "../application/cas-d-usage";
import type { EntreeHistorique, Operation, Reference } from "../domain/operation";

/** Relation → forme JSON historique : identifiant brut, `null`, ou document peuplé sous `_id`. */
function versReferenceJson(reference: Reference<{ id: string }> | undefined) {
  if (reference == null || typeof reference === "string") return reference;
  const { id, ...champs } = reference;
  return { _id: id, ...champs };
}

function versEntreeJson(entree: EntreeHistorique) {
  return {
    statut: entree.statut,
    date: entree.date,
    parUtilisateur: versReferenceJson(entree.parUtilisateur),
    ancienStatut: entree.ancienStatut,
  };
}

/** Forme JSON historique de l'API (document Mongoose sérialisé) ; les clés `undefined` sont omises par JSON. */
export function versReponseOperation(operation: Operation) {
  return {
    _id: operation.id,
    clientId: versReferenceJson(operation.clientId),
    siteId: versReferenceJson(operation.siteId),
    natureIntervention: operation.natureIntervention,
    dateHeurePrevue: operation.dateHeurePrevue,
    dureeEstimeeMinutes: operation.dureeEstimeeMinutes,
    equipeId: versReferenceJson(operation.equipeId),
    vehiculeId: versReferenceJson(operation.vehiculeId),
    equipementIds: operation.equipementIds.map(versReferenceJson),
    informationsParticulieres: operation.informationsParticulieres,
    statut: operation.statut,
    historiqueStatuts: operation.historiqueStatuts.map(versEntreeJson),
    quantiteCollectee: operation.quantiteCollectee,
    uniteQuantite: operation.uniteQuantite,
    remarquesTerrain: operation.remarquesTerrain,
    nomSignataireClient: operation.nomSignataireClient,
    signatureClient: operation.signatureClient,
    rapportPdf: operation.rapportPdf,
    photos: operation.photos,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    __v: operation.revision,
  };
}

const COULEURS: Record<OperationStatus, string> = {
  Planifiée: "#546E7A",
  Affectée: "#3949AB",
  "En route": "#FB8C00",
  "En cours": "#1976D2",
  Terminée: "#2E7D32",
  Rapportée: "#1B5E20",
  Retardée: "#E65100",
  Annulée: "#C62828",
};

// Repli historique pour un statut inconnu (ancienne valeur de `STATUS_CONFIG.Planifiée.color`).
const COULEUR_DE_REPLI = "text-status-planned";

/** Champ d'une relation peuplée ; `undefined` si la relation est absente, pendante ou non peuplée. */
function champ<T extends { id: string }, K extends keyof T>(reference: Reference<T> | undefined, cle: K): T[K] | undefined {
  return reference != null && typeof reference !== "string" ? reference[cle] : undefined;
}

/** Événement au format FullCalendar. */
export function versEvenementPlanning({ operation, statutEffectif, fin }: ElementPlanning) {
  const couleur = COULEURS[statutEffectif] ?? COULEUR_DE_REPLI;
  return {
    id: operation.id,
    title: `${champ(operation.clientId, "nom") ?? "Client"} — ${operation.natureIntervention}`,
    start: operation.dateHeurePrevue,
    end: fin,
    backgroundColor: couleur,
    borderColor: couleur,
    extendedProps: {
      statut: statutEffectif,
      site: champ(operation.siteId, "nom"),
      equipe: champ(operation.equipeId, "nom"),
      vehicule: champ(operation.vehiculeId, "identification"),
    },
  };
}
