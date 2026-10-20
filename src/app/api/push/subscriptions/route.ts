import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/backend/comptes/http/acteur";
import { enregistrerAbonnementPush, retirerAbonnementPush } from "@/backend/notifications/application/web-push";

const subscriptionSchema = z.object({
  endpoint: z.string().url().startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
const endpointSchema = z.object({ endpoint: z.string().url().startsWith("https://") });

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Abonnement push invalide." }, { status: 400 });
  await enregistrerAbonnementPush(auth.user.id, auth.role, parsed.data);
  return NextResponse.json({ subscribed: true }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const parsed = endpointSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Abonnement push invalide." }, { status: 400 });
  await retirerAbonnementPush(auth.user.id, parsed.data.endpoint);
  return NextResponse.json({ subscribed: false });
}
