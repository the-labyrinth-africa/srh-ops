import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { computeEffectiveStatus } from "@/lib/status-transitions";
import { STATUS_CONFIG } from "@/lib/status-styles";
import { Operation } from "@/models/Operation";
import type { OperationStatus } from "@/types";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const sp = req.nextUrl.searchParams;
  const dateDebut = sp.get("dateDebut");
  const dateFin = sp.get("dateFin");

  const filter: Record<string, unknown> = {};
  if (dateDebut || dateFin) {
    filter.dateHeurePrevue = {};
    if (dateDebut) (filter.dateHeurePrevue as Record<string, Date>).$gte = new Date(dateDebut);
    if (dateFin) (filter.dateHeurePrevue as Record<string, Date>).$lte = new Date(dateFin);
  }

  await connectDB();
  const operations = await Operation.find(filter)
    .populate("clientId", "nom")
    .populate("siteId", "nom")
    .populate("equipeId", "nom")
    .populate("vehiculeId", "identification")
    .lean();

  const events = operations.map((op) => {
    const statut = computeEffectiveStatus(
      op.statut as OperationStatus,
      new Date(op.dateHeurePrevue)
    );
    const end = new Date(
      new Date(op.dateHeurePrevue).getTime() +
        (op.dureeEstimeeMinutes ?? 120) * 60 * 1000
    );

    return {
      id: String(op._id),
      title: `${(op.clientId as { nom?: string })?.nom ?? "Client"} — ${op.natureIntervention}`,
      start: op.dateHeurePrevue,
      end,
      backgroundColor: getStatusColor(statut),
      borderColor: getStatusColor(statut),
      extendedProps: {
        statut,
        site: (op.siteId as { nom?: string })?.nom,
        equipe: (op.equipeId as { nom?: string })?.nom,
        vehicule: (op.vehiculeId as { identification?: string })?.identification,
      },
    };
  });

  return NextResponse.json(events);
}

function getStatusColor(statut: OperationStatus): string {
  const map: Record<OperationStatus, string> = {
    Planifiée: "#546E7A",
    Affectée: "#3949AB",
    "En route": "#FB8C00",
    "En cours": "#1976D2",
    Terminée: "#2E7D32",
    Rapportée: "#1B5E20",
    Retardée: "#E65100",
    Annulée: "#C62828",
  };
  return map[statut] ?? STATUS_CONFIG.Planifiée.color;
}
