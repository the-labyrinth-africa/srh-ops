import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { Equipement } from "@/models/Equipement";
import { equipementSchema } from "@/lib/validators/equipement";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  await connectDB();
  const equipements = await Equipement.find().sort({ nom: 1 }).lean();
  return NextResponse.json(equipements);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const body = await req.json();
  const parsed = equipementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await connectDB();
  const equipement = await Equipement.create(parsed.data);
  return NextResponse.json(equipement, { status: 201 });
}
