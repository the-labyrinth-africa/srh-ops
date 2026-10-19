import type { QuantiteUnite } from "@/shared/operations/quantites";

export interface OperationResume {
  id: string;
  natureIntervention: string;
  dateHeurePrevue: Date;
  client: { id: string; nom: string } | null;
  site: { id: string; nom: string } | null;
}

export interface Traceabilite {
  id: string;
  operationId: string;
  identifiantSuivi: string;
  typeDechet: string;
  volume: number;
  unite: QuantiteUnite;
  traitement: string;
  creePar: string;
  modifiePar: string;
  createdAt: Date;
  updatedAt: Date;
  operation?: OperationResume | null;
}

export interface TraceabiliteSaisie {
  identifiantSuivi: string;
  typeDechet: string;
  volume: number;
  unite: QuantiteUnite;
  traitement: string;
}

export interface FiltreTracabilite {
  operationId?: string;
}
