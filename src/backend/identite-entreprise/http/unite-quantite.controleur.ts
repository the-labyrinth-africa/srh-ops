import { NextResponse } from "next/server";
import { requireAuth } from "@/backend/comptes";
import { obtenirUniteQuantiteGlobale } from "../composition";

export async function GET() {
  const auth = await requireAuth(false, { allowSuperadmin: true });
  if (auth.error) return auth.error;

  const uniteQuantiteGlobale = await obtenirUniteQuantiteGlobale();
  return NextResponse.json(
    { uniteQuantiteGlobale },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
