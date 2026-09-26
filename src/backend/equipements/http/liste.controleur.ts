import { NextRequest, NextResponse } from "next/server";
import { requireInternalAuth } from "@/backend/comptes";
import { casDUsageEquipements } from "../composition";
import { equipementSchema, versSaisie } from "./equipement.schema";
import { versReponse } from "./presentation";

export async function GET() {
  const auth = await requireInternalAuth();
  if (auth.error) return auth.error;

  const equipements = await casDUsageEquipements.lister();
  return NextResponse.json(equipements.map(versReponse));
}

export async function POST(req: NextRequest) {
  const auth = await requireInternalAuth(true);
  if (auth.error) return auth.error;

  const body = await req.json();
  const parsed = equipementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const equipement = await casDUsageEquipements.creer(versSaisie(parsed.data));
  return NextResponse.json(versReponse(equipement), { status: 201 });
}
