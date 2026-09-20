import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import { requireAuth, requireReferentialRead, isWithinClientScope } from "@/lib/api-auth";
import { Client } from "@/models/Client";
import { User } from "@/models/User";
import { clientSchema } from "@/lib/validators/client";
import { guardObjectId } from "@/backend/platform/http/identifiants";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireReferentialRead();
  if (auth.error) return auth.error;

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  await connectDB();
  const client = await Client.findById(id).lean();
  if (!client) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  if (!isWithinClientScope(auth, (client as { _id?: unknown })._id)) {
    return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  }
  return NextResponse.json(client);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
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
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  await connectDB();
  if (await User.exists({ clientId: id })) {
    return NextResponse.json(
      { error: "Ce client est rattaché à des comptes utilisateurs" },
      { status: 409 }
    );
  }
  const client = await Client.findByIdAndDelete(id);
  if (!client) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  return NextResponse.json({ success: true });
}
