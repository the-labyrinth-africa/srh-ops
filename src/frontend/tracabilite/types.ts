import type { QuantiteUnite } from "@/shared/operations/quantites";

export interface TraceabiliteView {
  id: string;
  operationId: string;
  identifiantSuivi: string;
  typeDechet: string;
  volume: number;
  unite: QuantiteUnite;
  traitement: string;
  createdAt: string;
  updatedAt: string;
  operation?: {
    id: string;
    natureIntervention: string;
    dateHeurePrevue: string;
    client: { id: string; nom: string } | null;
    site: { id: string; nom: string } | null;
  } | null;
}
