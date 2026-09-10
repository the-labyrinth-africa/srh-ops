import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { Site } from "@/models/Site";
import { siteSchema } from "@/lib/validators/site";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const clientId = req.nextUrl.searchParams.get("clientId");
  await connectDB();
  const filter = clientId ? { clientId } : {};
  const sites = await Site.find(filter).populate("clientId", "nom").sort({ nom: 1 }).lean();
  return NextResponse.json(sites);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const body = await req.json();
  const parsed = siteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await connectDB();
  const site = await Site.create(parsed.data);
  return NextResponse.json(site, { status: 201 });
}
