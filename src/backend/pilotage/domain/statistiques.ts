import type { OperationStatus } from "@/shared/operations/statuts";
import type { TendanceMensuelle } from "@/shared/pilotage/tendance-mensuelle";
import { computeEffectiveStatus } from "@/shared/operations/statut-effectif";

/** Ce qu'il faut savoir d'une opération pour la compter et la signaler en retard. */
export interface OperationSuivie {
  id: string;
  natureIntervention: string;
  dateHeurePrevue: Date;
  statut: OperationStatus;
}

export interface CompteursOperations {
  prevues: number;
  enCours: number;
  terminees: number;
  retardees: number;
  annulees: number;
}

/** Répartit les opérations des six derniers mois selon leur statut effectif actuel. */
export function tendanceMensuelle(operations: OperationSuivie[], maintenant: Date): TendanceMensuelle[] {
  const mois: TendanceMensuelle[] = [];
  const indexParMois = new Map<string, number>();

  for (let decalage = 5; decalage >= 0; decalage--) {
    const date = new Date(maintenant.getFullYear(), maintenant.getMonth() - decalage, 1);
    const cle = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    indexParMois.set(cle, mois.length);
    mois.push({ mois: cle, prevues: 0, enCours: 0, terminees: 0, retardees: 0 });
  }

  for (const operation of operations) {
    const date = new Date(operation.dateHeurePrevue);
    const cle = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const index = indexParMois.get(cle);
    if (index === undefined) continue;

    const statut = computeEffectiveStatus(operation.statut, date, maintenant);
    if (["Planifiée", "Affectée"].includes(statut)) mois[index].prevues++;
    else if (["En route", "En cours"].includes(statut)) mois[index].enCours++;
    else if (["Terminée", "Rapportée"].includes(statut)) mois[index].terminees++;
    else if (statut === "Retardée") mois[index].retardees++;
  }

  return mois;
}

/**
 * Opération du jour telle que la renvoie le modèle de lecture : le document complet, avec le
 * client, le site (et l'équipe, si demandée) peuplés par leur nom, ou `null` s'ils ont été supprimés.
 */
export interface OperationDuJour {
  _id: unknown;
  natureIntervention: string;
  dateHeurePrevue: Date;
  statut: OperationStatus;
  clientId?: { nom?: string } | null;
  siteId?: { nom?: string } | null;
  equipeId?: { nom?: string } | null;
  [champ: string]: unknown;
}

const statutsEffectifs = (operations: OperationSuivie[], maintenant: Date): OperationStatus[] =>
  operations.map((op) => computeEffectiveStatus(op.statut, new Date(op.dateHeurePrevue), maintenant));

/** Compteurs du tableau de bord, sur le statut effectif (une opération dépassée non terminée est en retard). */
export function compterParStatut(operations: OperationSuivie[], maintenant: Date): CompteursOperations {
  const effectifs = statutsEffectifs(operations, maintenant);
  return {
    prevues: effectifs.filter((s) => ["Planifiée", "Affectée"].includes(s)).length,
    enCours: effectifs.filter((s) => ["En route", "En cours"].includes(s)).length,
    terminees: effectifs.filter((s) => ["Terminée", "Rapportée"].includes(s)).length,
    retardees: effectifs.filter((s) => s === "Retardée").length,
    annulees: effectifs.filter((s) => s === "Annulée").length,
  };
}

/** Les cinq premières opérations en retard, dans l'ordre reçu. */
export function operationsEnRetard(operations: OperationSuivie[], maintenant: Date): OperationSuivie[] {
  const effectifs = statutsEffectifs(operations, maintenant);
  return operations
    .filter((op, i) => effectifs[i] === "Retardée" && !["Terminée", "Rapportée", "Annulée"].includes(op.statut))
    .slice(0, 5)
    .map((op) => ({
      id: op.id,
      natureIntervention: op.natureIntervention,
      dateHeurePrevue: op.dateHeurePrevue,
      statut: "Retardée" as const,
    }));
}

/** Début et fin de la journée de `maintenant`, en heure locale. */
export function bornesDuJour(maintenant: Date): { debut: Date; fin: Date } {
  const debut = new Date(maintenant);
  debut.setHours(0, 0, 0, 0);
  const fin = new Date(maintenant);
  fin.setHours(23, 59, 59, 999);
  return { debut, fin };
}
