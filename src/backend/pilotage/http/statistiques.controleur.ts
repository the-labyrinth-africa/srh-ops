import { NextResponse } from "next/server";
import { requireInternalAuth } from "@/backend/comptes";
import { casDUsagePilotage } from "../composition";

export async function GET() {
  const auth = await requireInternalAuth();
  if (auth.error) return auth.error;

  return NextResponse.json(await casDUsagePilotage.statistiques());
}
