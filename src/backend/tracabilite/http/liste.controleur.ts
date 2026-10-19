import { NextResponse } from "next/server";
import { requireInternalAuth } from "@/backend/comptes";
import { casDUsageTracabilite } from "../composition";
import { versReponseTraceabilite } from "./presentation";

export async function GET() {
  const auth = await requireInternalAuth();
  if (auth.error) return auth.error;

  const items = await casDUsageTracabilite.listerToutes();
  return NextResponse.json({ items: items.map(versReponseTraceabilite) });
}
