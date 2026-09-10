import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { Vehicule } from "@/models/Vehicule";
import { vehiculeSchema } from "@/lib/validators/vehicule";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { id } = await params;
  await connectDB();
  const vehicule = await Vehicule.findById(id).lean();
  if (!vehicule) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  return NextResponse.json(vehicule);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;
  const { id } = await params;
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
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;
  const { id } = await params;
  await connectDB();
  const vehicule = await Vehicule.findByIdAndDelete(id);
  if (!vehicule) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  return NextResponse.json({ success: true });
}
