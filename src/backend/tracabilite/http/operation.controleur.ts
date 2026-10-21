import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireTerrainWrite } from "@/backend/comptes";
import type { AuthSuccess } from "@/backend/comptes";
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { obtenirUniteQuantiteGlobale } from "@/backend/identite-entreprise";
import { isClientUser } from "@/shared/acces/permissions";
import type { Acteur } from "@/shared/acces/acteur";
import { casDUsageTracabilite } from "../composition";
import { versReponseErreurTracabilite } from "./erreurs-http";
import { versReponseTraceabilite } from "./presentation";
import { traceabiliteSchema } from "./tracabilite.schema";

type Params = { params: Promise<{ id: string }> };

function versActeur(auth: AuthSuccess): Acteur {
  return { id: auth.user.id, role: auth.role, clientId: auth.clientId, equipeId: auth.equipeId };
}

async function lireCorps(request: NextRequest): Promise<unknown | NextResponse> {
  try {
    return await request.json();
  } catch (erreur) {
    if (erreur instanceof SyntaxError) {
      return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
    }
    throw erreur;
  }
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (isClientUser(auth.role)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  try {
    const items = await casDUsageTracabilite.listerParOperation(versActeur(auth), id);
    return NextResponse.json({ items: items.map(versReponseTraceabilite) });
  } catch (erreur) {
    return versReponseErreurTracabilite(erreur);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireTerrainWrite();
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  const body = await lireCorps(request);
  if (body instanceof NextResponse) return body;
  const parsed = traceabiliteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const uniteGlobale = await obtenirUniteQuantiteGlobale();
    const saisie = uniteGlobale ? { ...parsed.data, unite: uniteGlobale } : parsed.data;
    const item = await casDUsageTracabilite.creer(versActeur(auth), id, saisie);
    return NextResponse.json(versReponseTraceabilite(item), { status: 201 });
  } catch (erreur) {
    return versReponseErreurTracabilite(erreur);
  }
}

type TraceParams = { params: Promise<{ id: string; traceId: string }> };

export async function PUT(request: NextRequest, { params }: TraceParams) {
  const auth = await requireTerrainWrite();
  if (auth.error) return auth.error;
  const { id, traceId } = await params;
  const operationGuard = guardObjectId(id);
  if (!operationGuard.valid) return operationGuard.error;
  const traceGuard = guardObjectId(traceId);
  if (!traceGuard.valid) return traceGuard.error;

  const body = await lireCorps(request);
  if (body instanceof NextResponse) return body;
  const parsed = traceabiliteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const lignesExistantes = await casDUsageTracabilite.listerParOperation(versActeur(auth), id);
    const ligneExistante = lignesExistantes.find((ligne) => ligne.id === traceId);
    const uniteGlobale = await obtenirUniteQuantiteGlobale();
    const saisie = uniteGlobale
      ? { ...parsed.data, unite: ligneExistante?.volume !== parsed.data.volume ? uniteGlobale : ligneExistante?.unite ?? uniteGlobale }
      : parsed.data;
    const item = await casDUsageTracabilite.modifier(
      versActeur(auth),
      id,
      traceId,
      saisie
    );
    return NextResponse.json(versReponseTraceabilite(item));
  } catch (erreur) {
    return versReponseErreurTracabilite(erreur);
  }
}
