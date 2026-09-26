import { NextRequest, NextResponse } from "next/server";
import { requireInternalAuth } from "@/backend/comptes";
import { casDUsageVehicules } from "../composition";
import { vehiculeSchema, versSaisie } from "./vehicule.schema";
import { versReponse } from "./presentation";

export async function GET() {
  const auth = await requireInternalAuth();
  if (auth.error) return auth.error;

  const vehicules = await casDUsageVehicules.lister();
  return NextResponse.json(vehicules.map(versReponse));
}

export async function POST(req: NextRequest) {
  const auth = await requireInternalAuth(true);
  if (auth.error) return auth.error;

  const body = await req.json();
  const parsed = vehiculeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const vehicule = await casDUsageVehicules.creer(versSaisie(parsed.data));
  return NextResponse.json(versReponse(vehicule), { status: 201 });
}
