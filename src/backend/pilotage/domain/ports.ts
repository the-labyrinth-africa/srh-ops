import type { OperationDuJour, OperationSuivie } from "./statistiques";

/** Modèle de lecture du tableau de bord (requêtes directes sur les collections, en lecture seule). */
export interface StatistiquesQuery {
  /** Toutes les opérations, dans l'ordre de la base, réduites aux champs utiles au suivi. */
  operationsSuivies(): Promise<OperationSuivie[]>;
  compterClientsEtSites(): Promise<{ totalClients: number; totalSites: number }>;
  /** Opérations prévues entre `debut` et `fin` inclus, triées par heure croissante. */
  operationsDuJour(debut: Date, fin: Date, options: { avecEquipe: boolean }): Promise<OperationDuJour[]>;
}

/** Port local, structurellement compatible avec `SystemClock` de `platform/horloge`. */
export interface Horloge {
  maintenant(): Date;
}
