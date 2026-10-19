import type { Traceabilite } from "../domain/tracabilite";

export function versReponseTraceabilite(traceabilite: Traceabilite) {
  return {
    id: traceabilite.id,
    operationId: traceabilite.operationId,
    identifiantSuivi: traceabilite.identifiantSuivi,
    typeDechet: traceabilite.typeDechet,
    volume: traceabilite.volume,
    unite: traceabilite.unite,
    traitement: traceabilite.traitement,
    createdAt: traceabilite.createdAt,
    updatedAt: traceabilite.updatedAt,
    ...(traceabilite.operation ? { operation: traceabilite.operation } : {}),
  };
}
