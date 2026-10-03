/** Référence courte d'une opération, telle qu'imprimée sur le rapport et dans son nom de fichier. */
export function referenceRapport(operationId: string): string {
  return operationId.slice(-8).toUpperCase();
}

export function nomFichierRapport(operationId: string): string {
  return `rapport-${referenceRapport(operationId)}.pdf`;
}
