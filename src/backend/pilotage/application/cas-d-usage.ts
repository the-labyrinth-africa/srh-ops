import type { Horloge, StatistiquesQuery } from "../domain/ports";
import {
  bornesDuJour,
  compterParStatut,
  operationsEnRetard,
  tendanceMensuelle,
  type CompteursOperations,
  type OperationDuJour,
  type OperationSuivie,
} from "../domain/statistiques";
import type { TendanceMensuelle } from "@/shared/pilotage/tendance-mensuelle";

export interface DependancesPilotage {
  statistiques: StatistiquesQuery;
  horloge: Horloge;
}

export interface Statistiques {
  stats: CompteursOperations & { totalClients: number; totalSites: number };
  todayOps: OperationDuJour[];
  delayedOps: OperationSuivie[];
}

export interface TableauDeBord {
  stats: Pick<CompteursOperations, "prevues" | "enCours" | "terminees" | "retardees">;
  todayOps: OperationDuJour[];
  totalClients: number;
  totalSites: number;
  tendance: TendanceMensuelle[];
}

export function creerCasDUsagePilotage({ statistiques, horloge }: DependancesPilotage) {
  return {
    /** Statistiques de l'API : compteurs, opérations du jour (équipe comprise), opérations en retard. */
    async statistiques(): Promise<Statistiques> {
      const [operations, totaux] = await Promise.all([
        statistiques.operationsSuivies(),
        statistiques.compterClientsEtSites(),
      ]);
      const maintenant = horloge.maintenant();
      const { debut, fin } = bornesDuJour(maintenant);
      const todayOps = await statistiques.operationsDuJour(debut, fin, { avecEquipe: true });

      return {
        stats: { ...compterParStatut(operations, maintenant), ...totaux },
        todayOps,
        delayedOps: operationsEnRetard(operations, maintenant),
      };
    },

    /** Données de la page d'accueil de la direction. */
    async tableauDeBord(): Promise<TableauDeBord> {
      const operations = await statistiques.operationsSuivies();
      const maintenant = horloge.maintenant();
      const { prevues, enCours, terminees, retardees } = compterParStatut(operations, maintenant);
      const { debut, fin } = bornesDuJour(maintenant);

      const [todayOps, totaux] = await Promise.all([
        statistiques.operationsDuJour(debut, fin, { avecEquipe: false }),
        statistiques.compterClientsEtSites(),
      ]);

      return {
        stats: { prevues, enCours, terminees, retardees },
        todayOps,
        ...totaux,
        tendance: tendanceMensuelle(operations, maintenant),
      };
    },
  };
}

export type CasDUsagePilotage = ReturnType<typeof creerCasDUsagePilotage>;
