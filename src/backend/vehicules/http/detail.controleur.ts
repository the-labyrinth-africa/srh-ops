import { NextRequest, NextResponse } from "next/server";
import { requireInternalAuth } from "@/lib/api-auth"; // transitoire : migre avec `comptes` (R3)
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { VehiculeIntrouvable } from "../domain/erreurs";
import { casDUsageVehicules } from "../composition";
import { vehiculeSchema, versSaisie } from "./vehicule.schema";
import { versReponse } from "./presentation";

type Params = { params: Promise<{ id: string }> };

function reponseErreur(error: unknown) {
  if (error instanceof VehiculeIntrouvable) return NextResponse.json({ error: error.message }, { status: 404 });
  throw error;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireInternalAuth();
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  try {
    return NextResponse.json(versReponse(await casDUsageVehicules.obtenir(id)));
  } catch (error) {
    return reponseErreur(error);
  }
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

  try {
    return NextResponse.json(versReponse(await casDUsageVehicules.modifier(id, versSaisie(parsed.data))));
  } catch (error) {
    return reponseErreur(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireInternalAuth(true);
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  try {
    await casDUsageVehicules.supprimer(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return reponseErreur(error);
  }
}
