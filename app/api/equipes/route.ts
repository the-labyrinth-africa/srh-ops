import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { Equipe } from "@/models/Equipe";
import { equipeSchema } from "@/lib/validators/equipe";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  await connectDB();
  const equipes = await Equipe.find().sort({ nom: 1 }).lean();
  return NextResponse.json(equipes);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const body = await req.json();
  const parsed = equipeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await connectDB();
  const equipe = await Equipe.create(parsed.data);
  return NextResponse.json(equipe, { status: 201 });
}
