import { requirePageAccess } from "@/backend/comptes";
import { tableauDeBordDirection } from "@/backend/pilotage";
import { TableauDeBordDirection } from "@/frontend/pilotage";
import { computeEffectiveStatus } from "@/shared/operations/statut-effectif";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requirePageAccess("/");
  const { stats, todayOps, totalClients, totalSites } = await tableauDeBordDirection();

  return (
    <TableauDeBordDirection
      stats={stats}
      totalClients={totalClients}
      totalSites={totalSites}
      todayOps={todayOps.map((op) => ({
        id: String(op._id),
        natureIntervention: op.natureIntervention,
        statut: computeEffectiveStatus(op.statut, new Date(op.dateHeurePrevue)),
        dateHeurePrevue: op.dateHeurePrevue,
        clientNom: op.clientId?.nom,
        siteNom: op.siteId?.nom,
      }))}
    />
  );
}
