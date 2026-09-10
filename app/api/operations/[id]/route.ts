import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { checkAssignmentConflicts } from "@/lib/conflicts";
import { Operation } from "@/models/Operation";
import { Client } from "@/models/Client";
import { Site } from "@/models/Site";
import { Equipe } from "@/models/Equipe";
import { Vehicule } from "@/models/Vehicule";
import { Equipement } from "@/models/Equipement";
import { User } from "@/models/User";
import { operationSchema } from "@/lib/validators/operation";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { id } = await params;
  await connectDB();
  // Ensure models are registered for populate
  void Client; void Site; void Equipe; void Vehicule; void Equipement; void User;
  
  const operation = await Operation.findById(id)
    .populate("clientId", "nom contact")
    .populate("siteId", "nom adresse typeDechets")
    .populate("equipeId", "nom membres")
    .populate("vehiculeId", "identification type")
    .populate("equipementIds", "nom type")
    .populate("historiqueStatuts.parUtilisateur", "nom")
    .lean();

  if (!operation) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  return NextResponse.json(operation);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await req.json();
  const parsed = operationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const dateHeurePrevue = new Date(data.dateHeurePrevue);

  const conflicts = await checkAssignmentConflicts({
    dateHeurePrevue,
    dureeEstimeeMinutes: data.dureeEstimeeMinutes,
    equipeId: data.equipeId,
    vehiculeId: data.vehiculeId,
    excludeOperationId: id,
  });

  if (conflicts.some((c) => c.hasConflict)) {
    return NextResponse.json(
      { error: "Conflit d'affectation", conflicts },
      { status: 409 }
    );
  }

  await connectDB();
  const operation = await Operation.findByIdAndUpdate(
    id,
    { ...data, dateHeurePrevue },
    { new: true }
  )
    .populate("clientId", "nom")
    .populate("siteId", "nom")
    .populate("equipeId", "nom")
    .populate("vehiculeId", "identification")
    .lean();

  if (!operation) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  return NextResponse.json(operation);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const { id } = await params;
  await connectDB();
  const operation = await Operation.findByIdAndDelete(id);
  if (!operation) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  return NextResponse.json({ success: true });
}
