import { requirePageAccess } from "@/backend/comptes";
import { tableauDeBordDirection } from "@/backend/pilotage";
import { TableauDeBordDirection } from "@/frontend/pilotage";
import { computeEffectiveStatus } from "@/shared/operations/statut-effectif";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requirePageAccess("/");
  const { stats, todayOps, totalClients, totalSites, tendance } = await tableauDeBordDirection();
  const dateFinExport = new Date();
  const dateDebutExport = new Date(dateFinExport.getFullYear(), dateFinExport.getMonth(), 1);

  return (
    <TableauDeBordDirection
      stats={stats}
      totalClients={totalClients}
      totalSites={totalSites}
      tendance={tendance}
      dateDebutExport={`${dateDebutExport.getFullYear()}-${String(dateDebutExport.getMonth() + 1).padStart(2, "0")}-${String(dateDebutExport.getDate()).padStart(2, "0")}`}
      dateFinExport={`${dateFinExport.getFullYear()}-${String(dateFinExport.getMonth() + 1).padStart(2, "0")}-${String(dateFinExport.getDate()).padStart(2, "0")}`}
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
