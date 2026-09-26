import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireReferentialRead, isWithinClientScope } from "@/backend/comptes";
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { ClientIntrouvable, ClientRattache } from "../domain/erreurs";
import { casDUsageClients } from "../composition";
import { clientSchema, versSaisieClient } from "./client.schema";
import { versReponseClient } from "./presentation";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireReferentialRead();
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  let client;
  try {
    client = await casDUsageClients.obtenir(id);
  } catch (error) {
    if (error instanceof ClientIntrouvable) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
  if (!isWithinClientScope(auth, client.id)) {
    return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  }
  return NextResponse.json(versReponseClient(client));
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  const body = await req.json();
  const parsed = clientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    return NextResponse.json(versReponseClient(await casDUsageClients.modifier(id, versSaisieClient(parsed.data))));
  } catch (error) {
    if (error instanceof ClientIntrouvable) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  try {
    await casDUsageClients.supprimer(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ClientRattache) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof ClientIntrouvable) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
