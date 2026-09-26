import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import { requireTerrainWrite, isWithinTeamScope, chauffeurWithoutTeamError, TEAM_SCOPE_ERROR } from "@/backend/comptes";
import { canTransition } from "@/lib/status-transitions";
import { Operation } from "@/models/Operation";
import { statusUpdateSchema } from "@/lib/validators/operation";
import { guardObjectId } from "@/backend/platform/http/identifiants";
import type { OperationStatus } from "@/shared/operations/statuts";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireTerrainWrite();
  if (auth.error) return auth.error;
  const noTeam = chauffeurWithoutTeamError(auth);
  if (noTeam) return noTeam;

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  const body = await req.json();
  const parsed = statusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const newStatus = parsed.data.statut as OperationStatus;

  await connectDB();
  const operation = await Operation.findById(id);
  if (!operation) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });

  if (!isWithinTeamScope(auth, operation.equipeId)) {
    return NextResponse.json({ error: TEAM_SCOPE_ERROR }, { status: 403 });
  }

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

  if (parsed.data.quantiteCollectee !== undefined) {
    operation.quantiteCollectee = parsed.data.quantiteCollectee;
  }
  if (parsed.data.uniteQuantite) {
    operation.uniteQuantite = parsed.data.uniteQuantite;
  }
  if (parsed.data.remarquesTerrain !== undefined) {
    operation.remarquesTerrain = parsed.data.remarquesTerrain;
  }
  if (parsed.data.nomSignataireClient !== undefined) {
    operation.nomSignataireClient = parsed.data.nomSignataireClient;
  }
  if (parsed.data.signatureClient !== undefined) {
    operation.signatureClient = parsed.data.signatureClient;
  }
  if (parsed.data.photos !== undefined) {
    operation.photos = parsed.data.photos;
  }

  operation.historiqueStatuts.push({
    statut: newStatus,
    date: new Date(),
    parUtilisateur: new mongoose.Types.ObjectId(auth.user.id),
    ancienStatut: currentStatus,
  });

  await operation.save();

  const populated = await Operation.findById(id)
    .populate("clientId", "nom")
    .populate("siteId", "nom adresse")
    .populate("equipeId", "nom")
    .populate("vehiculeId", "identification")
    .populate("equipementIds", "nom")
    .lean();

  return NextResponse.json(populated);
}
