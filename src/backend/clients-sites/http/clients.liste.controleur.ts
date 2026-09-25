import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireReferentialRead } from "@/lib/api-auth"; // transitoire : migre avec comptes (R3)
import { isClientUser } from "@/shared/acces/permissions";
import { casDUsageClients } from "../composition";
import { clientSchema, versSaisieClient } from "./client.schema";
import { versReponseClient } from "./presentation";

export async function GET() {
  const auth = await requireReferentialRead();
  if (auth.error) return auth.error;

  const idClient = isClientUser(auth.role) ? auth.clientId : undefined;
  const clients = await casDUsageClients.lister(idClient);
  return NextResponse.json(clients.map(versReponseClient));
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const body = await req.json();
  const parsed = clientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const client = await casDUsageClients.creer(versSaisieClient(parsed.data));
  return NextResponse.json(versReponseClient(client), { status: 201 });
}
