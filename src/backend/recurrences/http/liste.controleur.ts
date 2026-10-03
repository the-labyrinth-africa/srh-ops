import { NextRequest, NextResponse } from "next/server";
import { requireInternalAuth } from "@/backend/comptes";
import { casDUsageRecurrences } from "../composition";
import type { FiltreRecurrences } from "../domain/recurrence";
import { versReponseRecurrence } from "./presentation";
import { recurrenceSchema, versSaisieRecurrence } from "./recurrence.schema";

export async function GET(req: NextRequest) {
  const auth = await requireInternalAuth();
  if (auth.error) return auth.error;

  const sp = req.nextUrl.searchParams;
  const filtre: FiltreRecurrences = {};

  const clientId = sp.get("clientId");
  const siteId = sp.get("siteId");
  const frequence = sp.get("frequence");
  const active = sp.get("active");
  if (clientId) filtre.clientId = clientId;
  if (siteId) filtre.siteId = siteId;
  if (frequence) filtre.frequence = frequence;
  // Toute valeur non vide autre que « true » filtre sur les récurrences inactives (comportement historique).
  if (active) filtre.active = active === "true";

  const items = await casDUsageRecurrences.lister(filtre);
  return NextResponse.json({ items: items.map(versReponseRecurrence) });
}

export async function POST(req: NextRequest) {
  const auth = await requireInternalAuth(true);
  if (auth.error) return auth.error;

  const body = await req.json();
  const parsed = recurrenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const recurrence = await casDUsageRecurrences.creer(versSaisieRecurrence(parsed.data));
  return NextResponse.json(versReponseRecurrence(recurrence), { status: 201 });
}
