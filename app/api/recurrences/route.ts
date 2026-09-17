import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { Recurrence } from "@/models/Recurrence";
import { recurrenceSchema } from "@/lib/validators/recurrence";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const sp = req.nextUrl.searchParams;
  const filter: Record<string, unknown> = {};

  if (sp.get("clientId")) filter.clientId = sp.get("clientId");
  if (sp.get("siteId")) filter.siteId = sp.get("siteId");
  if (sp.get("frequence")) filter.frequence = sp.get("frequence");
  if (sp.get("active")) filter.active = sp.get("active") === "true";

  await connectDB();
  const items = await Recurrence.find(filter)
    .populate("clientId", "nom")
    .populate("siteId", "nom adresse")
    .populate("equipeId", "nom")
    .populate("vehiculeId", "identification")
    .populate("equipementIds", "nom")
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const body = await req.json();
  const parsed = recurrenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await connectDB();
  const recurrence = await Recurrence.create(parsed.data);

  const populated = await Recurrence.findById(recurrence._id)
    .populate("clientId", "nom")
    .populate("siteId", "nom adresse")
    .populate("equipeId", "nom")
    .populate("vehiculeId", "identification")
    .populate("equipementIds", "nom")
    .lean();

  return NextResponse.json(populated, { status: 201 });
}
