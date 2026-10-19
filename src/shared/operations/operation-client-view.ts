import type { OperationStatus } from "./statuts";
import type { QuantiteUnite } from "./quantites";

export interface OperationClientSource {
  id: string;
  siteId?: string | null | { id: string; nom?: string; adresse?: string };
  natureIntervention: string;
  dateHeurePrevue: Date;
  statut: OperationStatus;
  quantiteCollectee?: number;
  uniteQuantite: QuantiteUnite;
  createdAt?: Date;
  updatedAt?: Date;
}

export function versOperationClientJson(operation: OperationClientSource) {
  const site = operation.siteId && typeof operation.siteId === "object"
    ? {
        _id: operation.siteId.id,
        nom: operation.siteId.nom,
        adresse: operation.siteId.adresse,
      }
    : operation.siteId;
  return {
    _id: operation.id,
    siteId: site,
    natureIntervention: operation.natureIntervention,
    dateHeurePrevue: operation.dateHeurePrevue,
    statut: operation.statut,
    quantiteCollectee: operation.quantiteCollectee,
    uniteQuantite: operation.uniteQuantite,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
  };
}
