import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { canTransition } from "@/lib/status-transitions";
import { Operation } from "@/models/Operation";
import { statusUpdateSchema } from "@/lib/validators/operation";
import type { OperationStatus } from "@/types";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await req.json();
  const parsed = statusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const newStatus = parsed.data.statut as OperationStatus;

  await connectDB();
  const operation = await Operation.findById(id);
  if (!operation) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });

  const currentStatus = operation.statut as OperationStatus;

  if (!canTransition(currentStatus, newStatus)) {
    return NextResponse.json(
      { error: `Transition ${currentStatus} → ${newStatus} non autorisée` },
      { status: 400 }
    );
  }

  if (newStatus === "Terminée" && currentStatus !== "En cours") {
    console.warn(
      `[cohérence] Opération ${id} passée Terminée sans En cours (était ${currentStatus})`
    );
  }

  operation.statut = newStatus;
  operation.historiqueStatuts.push({
    statut: newStatus,
    date: new Date(),
    parUtilisateur: new mongoose.Types.ObjectId(auth.user.id),
    ancienStatut: currentStatus,
  });

  await operation.save();

  const populated = await Operation.findById(id)
    .populate("clientId", "nom")
    .populate("siteId", "nom")
    .populate("equipeId", "nom")
    .populate("vehiculeId", "identification")
    .lean();

  return NextResponse.json(populated);
}
