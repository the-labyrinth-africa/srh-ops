import mongoose from "mongoose";
import { Operation } from "@/models/Operation";

const DEFAULT_DURATION_MINUTES = 120;

export interface ConflictResult {
  hasConflict: boolean;
  message?: string;
  conflictingOperationId?: string;
}

function getEndDate(start: Date, durationMinutes: number) {
  return new Date(start.getTime() + durationMinutes * 60 * 1000);
}

function overlaps(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date
): boolean {
  return startA < endB && endA > startB;
}

export async function checkAssignmentConflicts(params: {
  dateHeurePrevue: Date;
  dureeEstimeeMinutes?: number;
  equipeId?: string;
  vehiculeId?: string;
  excludeOperationId?: string;
}): Promise<ConflictResult[]> {
  const {
    dateHeurePrevue,
    dureeEstimeeMinutes = DEFAULT_DURATION_MINUTES,
    equipeId,
    vehiculeId,
    excludeOperationId,
  } = params;

  const start = dateHeurePrevue;
  const end = getEndDate(start, dureeEstimeeMinutes);
  const conflicts: ConflictResult[] = [];

  const filter: Record<string, unknown> = {
    statut: { $nin: ["Annulée", "Terminée", "Rapportée"] },
    dateHeurePrevue: {
      $gte: new Date(start.getTime() - DEFAULT_DURATION_MINUTES * 60 * 1000),
      $lte: end,
    },
  };

  if (excludeOperationId) {
    filter._id = { $ne: new mongoose.Types.ObjectId(excludeOperationId) };
  }

  const candidates = await Operation.find(filter).lean();

  for (const op of candidates) {
    const opStart = new Date(op.dateHeurePrevue);
    const opEnd = getEndDate(
      opStart,
      op.dureeEstimeeMinutes ?? DEFAULT_DURATION_MINUTES
    );

    if (!overlaps(start, end, opStart, opEnd)) continue;

    if (equipeId && op.equipeId?.toString() === equipeId) {
      conflicts.push({
        hasConflict: true,
        message: "L'équipe est déjà affectée à une opération sur ce créneau",
        conflictingOperationId: String(op._id),
      });
    }
    if (vehiculeId && op.vehiculeId?.toString() === vehiculeId) {
      conflicts.push({
        hasConflict: true,
        message: "Le véhicule est déjà affecté à une opération sur ce créneau",
        conflictingOperationId: String(op._id),
      });
    }
  }

  return conflicts;
}
