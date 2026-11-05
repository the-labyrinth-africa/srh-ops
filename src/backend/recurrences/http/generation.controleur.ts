import { NextRequest, NextResponse } from "next/server";
import { requireInternalAuth } from "@/backend/comptes";

export async function POST(_req: NextRequest) {
  const auth = await requireInternalAuth(true);
  if (auth.error) return auth.error;
  return NextResponse.json({ error: "La création automatique d'opérations récurrentes est désactivée. Les tournées sont désormais calculées depuis l'historique des collectes." }, { status: 410 });
}
