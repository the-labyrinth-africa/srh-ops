import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireReferentialRead, isWithinClientScope } from "@/lib/api-auth"; // transitoire : migre avec comptes (R3)
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { SiteIntrouvable } from "../domain/erreurs";
import { casDUsageSites } from "../composition";
import { siteSchema, versSaisieSite } from "./site.schema";
import { versReponseSitePeuple, versReponseSite } from "./presentation";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireReferentialRead();
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  let site;
  try {
    site = await casDUsageSites.obtenir(id);
  } catch (error) {
    if (error instanceof SiteIntrouvable) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
  const clientIdBrut = typeof site.clientId === "string" ? site.clientId : site.clientId.id;
  if (!isWithinClientScope(auth, clientIdBrut)) {
    return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  }
  return NextResponse.json(versReponseSitePeuple(site));
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  const body = await req.json();
  const parsed = siteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    return NextResponse.json(versReponseSite(await casDUsageSites.modifier(id, versSaisieSite(parsed.data))));
  } catch (error) {
    if (error instanceof SiteIntrouvable) return NextResponse.json({ error: error.message }, { status: 404 });
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
    await casDUsageSites.supprimer(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof SiteIntrouvable) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
