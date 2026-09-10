import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { Vehicule } from "@/models/Vehicule";
import { vehiculeSchema } from "@/lib/validators/vehicule";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  await connectDB();
  const vehicules = await Vehicule.find().sort({ identification: 1 }).lean();
  return NextResponse.json(vehicules);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const body = await req.json();
  const parsed = vehiculeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await connectDB();
  const vehicule = await Vehicule.create(parsed.data);
  return NextResponse.json(vehicule, { status: 201 });
}
