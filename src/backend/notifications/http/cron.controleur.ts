import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { programmerAlertesQuotidiennes, traiterFileNotifications } from "../composition";

function secretValide(request: NextRequest, secret: string): boolean {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const fourni = Buffer.from(authorization.slice("Bearer ".length));
  const attendu = Buffer.from(secret);
  return fourni.length === attendu.length && timingSafeEqual(fourni, attendu);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("[notifications-cron] CRON_SECRET n'est pas configuré.");
    return NextResponse.json({ error: "Service de notifications non configuré." }, { status: 503 });
  }
  if (!secretValide(request, secret)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  }

  const programmees = await programmerAlertesQuotidiennes();
  const resultat = await traiterFileNotifications();
  return NextResponse.json({ programmees, ...resultat }, { headers: { "Cache-Control": "no-store" } });
}
