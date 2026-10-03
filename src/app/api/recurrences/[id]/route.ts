import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import { requireInternalAuth } from "@/backend/comptes";
import { Recurrence } from "@/backend/recurrences/infrastructure/mongoose/recurrence.model";
import { recurrenceSchema } from "@/backend/recurrences/http/recurrence.schema";
import { guardObjectId } from "@/backend/platform/http/identifiants";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const auth = await requireInternalAuth();
  if (auth.error) return auth.error;

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  await connectDB();

  const recurrence = await Recurrence.findById(id)
    .populate("clientId", "nom")
    .populate("siteId", "nom adresse")
    .populate("equipeId", "nom")
    .populate("vehiculeId", "identification")
    .populate("equipementIds", "nom")
    .lean();

  if (!recurrence) {
    return NextResponse.json({ error: "Récurrence non trouvée" }, { status: 404 });
  }

  return NextResponse.json(recurrence);
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const auth = await requireInternalAuth(true);
  if (auth.error) return auth.error;

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  const body = await req.json();

  const parsed = recurrenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await connectDB();
  const updated = await Recurrence.findByIdAndUpdate(id, parsed.data, {
    new: true,
  })
    .populate("clientId", "nom")
    .populate("siteId", "nom adresse")
    .populate("equipeId", "nom")
    .populate("vehiculeId", "identification")
    .populate("equipementIds", "nom")
    .lean();

  if (!updated) {
    return NextResponse.json({ error: "Récurrence non trouvée" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const auth = await requireInternalAuth(true);
  if (auth.error) return auth.error;

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  await connectDB();

  const deleted = await Recurrence.findByIdAndDelete(id);
  if (!deleted) {
    return NextResponse.json({ error: "Récurrence non trouvée" }, { status: 404 });
  }

  return NextResponse.json({ message: "Récurrence supprimée avec succès" });
}
