import { NextRequest, NextResponse } from "next/server";
import { notifierDemandeQualifiee, traiterFileNotifications } from "@/backend/notifications";
import { runAfterResponse } from "@/backend/platform/execution-differee/execution-differee";
import { requireAuth } from "@/backend/comptes";
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { casDUsageDemandes } from "../composition";
import {
  DemandeDejaTraitee,
  DemandePubliqueIntrouvable,
  SiteDemandeInvalide,
} from "../domain/erreurs";
import { qualificationDemandeSchema, refusDemandeSchema } from "./schemas";
import { versDemandePubliqueJson } from "./presentation";

type Params = { params: Promise<{ id: string }> };

async function lireCorps(request: NextRequest): Promise<unknown | NextResponse> {
  try {
    return await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
    throw error;
  }
}

export async function POSTConvertir(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  const body = await lireCorps(request);
  if (body instanceof NextResponse) return body;
  const parsed = qualificationDemandeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const demande = await casDUsageDemandes.convertir(id, parsed.data, auth.user.id);
    const operationId = demande.operationId;
    if (operationId) {
      await runAfterResponse(async () => {
        await notifierDemandeQualifiee(operationId);
        await traiterFileNotifications();
      });
    }
    return NextResponse.json(versDemandePubliqueJson(demande));
  } catch (error) {
    if (error instanceof DemandePubliqueIntrouvable) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof DemandeDejaTraitee) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof SiteDemandeInvalide) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

export async function POSTRefuser(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  const body = await lireCorps(request);
  if (body instanceof NextResponse) return body;
  const parsed = refusDemandeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    await casDUsageDemandes.refuser(id, auth.user.id, parsed.data.motif);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof DemandePubliqueIntrouvable) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof DemandeDejaTraitee) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
