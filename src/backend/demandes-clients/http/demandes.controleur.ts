import { NextResponse } from "next/server";
import { requireAuth } from "@/backend/comptes";
import { casDUsageDemandes } from "../composition";
import { versDemandePubliqueJson } from "./presentation";

export async function GET() {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;
  const items = await casDUsageDemandes.lister();
  return NextResponse.json({ items: items.map(versDemandePubliqueJson) }, { headers: { "Cache-Control": "no-store" } });
}
