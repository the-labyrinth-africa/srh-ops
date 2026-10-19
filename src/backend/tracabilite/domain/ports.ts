import type { Traceabilite, TraceabiliteSaisie } from "./tracabilite";

export interface TraceabiliteRepository {
  lister(operationId?: string): Promise<Traceabilite[]>;
  trouverParId(id: string): Promise<Traceabilite | null>;
  creer(
    operationId: string,
    saisie: TraceabiliteSaisie,
    acteurId: string
  ): Promise<Traceabilite>;
  modifier(
    id: string,
    saisie: TraceabiliteSaisie,
    acteurId: string
  ): Promise<Traceabilite | null>;
}
