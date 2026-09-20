import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireInternalAuth } from "@/lib/api-auth";
import { Recurrence } from "@/models/Recurrence";
import { recurrenceSchema } from "@/lib/validators/recurrence";
import { guardObjectId } from "@/lib/mongo-id";

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
