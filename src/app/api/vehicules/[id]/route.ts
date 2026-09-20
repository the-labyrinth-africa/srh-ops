import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import { requireInternalAuth } from "@/lib/api-auth";
import { Vehicule } from "@/models/Vehicule";
import { vehiculeSchema } from "@/lib/validators/vehicule";
import { guardObjectId } from "@/backend/platform/http/identifiants";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireInternalAuth();
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  await connectDB();
  const vehicule = await Vehicule.findById(id).lean();
  if (!vehicule) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  return NextResponse.json(vehicule);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireInternalAuth(true);
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  const body = await req.json();
  const parsed = vehiculeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  await connectDB();
  const vehicule = await Vehicule.findByIdAndUpdate(id, parsed.data, { new: true }).lean();
  if (!vehicule) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  return NextResponse.json(vehicule);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireInternalAuth(true);
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  await connectDB();
  const vehicule = await Vehicule.findByIdAndDelete(id);
  if (!vehicule) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  return NextResponse.json({ success: true });
}
