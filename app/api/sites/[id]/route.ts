import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { Site } from "@/models/Site";
import { siteSchema } from "@/lib/validators/site";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { id } = await params;
  await connectDB();
  const site = await Site.findById(id).populate("clientId", "nom").lean();
  if (!site) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  return NextResponse.json(site);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await req.json();
  const parsed = siteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await connectDB();
  const site = await Site.findByIdAndUpdate(id, parsed.data, { new: true }).lean();
  if (!site) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  return NextResponse.json(site);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const { id } = await params;
  await connectDB();
  const site = await Site.findByIdAndDelete(id);
  if (!site) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  return NextResponse.json({ success: true });
}
