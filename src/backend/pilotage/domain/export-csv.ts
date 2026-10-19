import type { OperationStatus } from "@/shared/operations/statuts";
import type { QuantiteUnite } from "@/shared/operations/quantites";
import { computeEffectiveStatus } from "@/shared/operations/statut-effectif";

export interface OperationAExporter {
  id: string;
  client: string;
  site: string;
  natureIntervention: string;
  dateHeurePrevue: Date;
  statut: OperationStatus;
  quantiteCollectee?: number;
  uniteQuantite?: QuantiteUnite;
}

function cellule(valeur: string | number): string {
  let texte = String(valeur);
  if (typeof valeur === "string" && /^[\t\r =+\-@]/.test(texte)) texte = `'${texte}`;
  return `"${texte.replaceAll('"', '""')}"`;
}

export function exporterOperationsCsv(operations: OperationAExporter[], maintenant: Date): string {
  const lignes = [
    ["Identifiant", "Client", "Site", "Intervention", "Date prévue (UTC)", "Statut effectif", "Quantité collectée", "Unité"],
    ...operations.map((operation) => [
      operation.id,
      operation.client,
      operation.site,
      operation.natureIntervention,
      operation.dateHeurePrevue.toISOString(),
      computeEffectiveStatus(operation.statut, operation.dateHeurePrevue, maintenant),
      operation.quantiteCollectee ?? "",
      operation.uniteQuantite ?? "",
    ]),
  ];
  return `\uFEFF${lignes.map((ligne) => ligne.map(cellule).join(";")).join("\r\n")}\r\n`;
}
