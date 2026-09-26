import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireReferentialRead } from "@/backend/comptes";
import { isClientUser } from "@/shared/acces/permissions";
import { casDUsageSites } from "../composition";
import { siteSchema, versSaisieSite } from "./site.schema";
import { versReponseSitePeuple, versReponseSite } from "./presentation";

export async function GET(req: NextRequest) {
  const auth = await requireReferentialRead();
  if (auth.error) return auth.error;

  const clientId = isClientUser(auth.role) ? auth.clientId : req.nextUrl.searchParams.get("clientId");
  const sites = await casDUsageSites.lister(clientId ?? undefined);
  return NextResponse.json(sites.map(versReponseSitePeuple));
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const body = await req.json();
  const parsed = siteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const site = await casDUsageSites.creer(versSaisieSite(parsed.data));
  return NextResponse.json(versReponseSite(site), { status: 201 });
}
