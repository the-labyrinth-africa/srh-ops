import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { Equipe } from "@/models/Equipe";
import { equipeSchema } from "@/lib/validators/equipe";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { id } = await params;
  await connectDB();
  const equipe = await Equipe.findById(id).lean();
  if (!equipe) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  return NextResponse.json(equipe);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = await req.json();
  const parsed = equipeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  await connectDB();
  const equipe = await Equipe.findByIdAndUpdate(id, parsed.data, { new: true }).lean();
  if (!equipe) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  return NextResponse.json(equipe);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;
  const { id } = await params;
  await connectDB();
  const equipe = await Equipe.findByIdAndDelete(id);
  if (!equipe) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  return NextResponse.json({ success: true });
}
