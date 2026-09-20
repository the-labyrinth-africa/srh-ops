import { NextRequest, NextResponse } from "next/server";
import { requireInternalAuth } from "@/lib/api-auth"; // transitoire : migre avec `comptes` (R3)
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { EquipementIntrouvable } from "../domain/erreurs";
import { casDUsageEquipements } from "../composition";
import { equipementSchema, versSaisie } from "./equipement.schema";
import { versReponse } from "./presentation";

type Params = { params: Promise<{ id: string }> };

function reponseErreur(error: unknown) {
  if (error instanceof EquipementIntrouvable) return NextResponse.json({ error: error.message }, { status: 404 });
  throw error;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireInternalAuth();
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  try {
    return NextResponse.json(versReponse(await casDUsageEquipements.obtenir(id)));
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
  const parsed = equipementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    return NextResponse.json(versReponse(await casDUsageEquipements.modifier(id, versSaisie(parsed.data))));
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
    await casDUsageEquipements.supprimer(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return reponseErreur(error);
  }
}
