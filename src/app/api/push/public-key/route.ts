import { NextResponse } from "next/server";
import { requireAuth } from "@/backend/comptes/http/acteur";
import { clePubliquePush } from "@/backend/notifications/application/web-push";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const publicKey = clePubliquePush();
  if (!publicKey) return NextResponse.json({ error: "Notifications push non configurées." }, { status: 503 });
  return NextResponse.json({ publicKey }, { headers: { "Cache-Control": "no-store" } });
}
