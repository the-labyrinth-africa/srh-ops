import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { Client } from "@/models/Client";
import { clientSchema } from "@/lib/validators/client";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { id } = await params;
  await connectDB();
  const client = await Client.findById(id).lean();
  if (!client) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  return NextResponse.json(client);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await req.json();
  const parsed = clientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await connectDB();
  const client = await Client.findByIdAndUpdate(id, parsed.data, { new: true }).lean();
  if (!client) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  return NextResponse.json(client);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const { id } = await params;
  await connectDB();
  const client = await Client.findByIdAndDelete(id);
  if (!client) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  return NextResponse.json({ success: true });
}
