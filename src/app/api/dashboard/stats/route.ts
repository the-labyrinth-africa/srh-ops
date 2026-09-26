import { NextResponse } from "next/server";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import { requireInternalAuth } from "@/backend/comptes";
import { computeEffectiveStatus } from "@/lib/status-transitions";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Site } from "@/backend/clients-sites/infrastructure/mongoose/site.model";
import { Operation } from "@/models/Operation";
import type { OperationStatus } from "@/shared/operations/statuts";

export async function GET() {
  const auth = await requireInternalAuth();
  if (auth.error) return auth.error;

  await connectDB();

  const [operations, totalClients, totalSites] = await Promise.all([
    Operation.find().lean(),
    Client.countDocuments(),
    Site.countDocuments(),
  ]);

  const effectiveStatuses = operations.map((op) =>
    computeEffectiveStatus(op.statut as OperationStatus, new Date(op.dateHeurePrevue))
  );

  const stats = {
    prevues: effectiveStatuses.filter((s) =>
      ["Planifiée", "Affectée"].includes(s)
    ).length,
    enCours: effectiveStatuses.filter((s) =>
      ["En route", "En cours"].includes(s)
    ).length,
    terminees: effectiveStatuses.filter((s) =>
      ["Terminée", "Rapportée"].includes(s)
    ).length,
    retardees: effectiveStatuses.filter((s) => s === "Retardée").length,
    annulees: effectiveStatuses.filter((s) => s === "Annulée").length,
    totalClients,
    totalSites,
  };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const todayOps = await Operation.find({
    dateHeurePrevue: { $gte: todayStart, $lte: todayEnd },
  })
    .populate("clientId", "nom")
    .populate("siteId", "nom")
    .populate("equipeId", "nom")
    .sort({ dateHeurePrevue: 1 })
    .lean();

  const delayedOps = operations
    .filter(
      (op, i) =>
        effectiveStatuses[i] === "Retardée" &&
        !["Terminée", "Rapportée", "Annulée"].includes(op.statut)
    )
    .slice(0, 5)
    .map((op) => ({
      id: String(op._id),
      natureIntervention: op.natureIntervention,
      dateHeurePrevue: op.dateHeurePrevue,
      statut: effectiveStatuses[operations.indexOf(op)],
    }));

  return NextResponse.json({ stats, todayOps, delayedOps });
}
