import { NextRequest, NextResponse } from "next/server";
import { requireInternalAuth } from "@/backend/comptes";
import { casDUsageEquipes } from "../composition";
import { equipeSchema, versSaisie } from "./equipe.schema";
import { versReponse } from "./presentation";

export async function GET() {
  const auth = await requireInternalAuth();
  if (auth.error) return auth.error;

  const equipes = await casDUsageEquipes.lister();
  return NextResponse.json(equipes.map(versReponse));
}

export async function POST(req: NextRequest) {
  const auth = await requireInternalAuth(true);
  if (auth.error) return auth.error;

  const body = await req.json();
  const parsed = equipeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const equipe = await casDUsageEquipes.creer(versSaisie(parsed.data));
  return NextResponse.json(versReponse(equipe), { status: 201 });
}
