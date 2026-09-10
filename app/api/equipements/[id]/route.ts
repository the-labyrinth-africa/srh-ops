import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { Equipement } from "@/models/Equipement";
import { equipementSchema } from "@/lib/validators/equipement";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { id } = await params;
  await connectDB();
  const equipement = await Equipement.findById(id).lean();
  if (!equipement) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  return NextResponse.json(equipement);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = await req.json();
  const parsed = equipementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  await connectDB();
  const equipement = await Equipement.findByIdAndUpdate(id, parsed.data, { new: true }).lean();
  if (!equipement) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  return NextResponse.json(equipement);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;
  const { id } = await params;
  await connectDB();
  const equipement = await Equipement.findByIdAndDelete(id);
  if (!equipement) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  return NextResponse.json({ success: true });
}
