import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { isClientUser } from "@/lib/permissions";
import { Client } from "@/models/Client";
import { clientSchema } from "@/lib/validators/client";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  // Un compte client ne voit que sa propre fiche.
  const filter = isClientUser(auth.role) ? { _id: auth.clientId } : {};

  await connectDB();
  const clients = await Client.find(filter).sort({ nom: 1 }).lean();
  return NextResponse.json(clients);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const body = await req.json();
  const parsed = clientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await connectDB();
  const client = await Client.create(parsed.data);
  return NextResponse.json(client, { status: 201 });
}
