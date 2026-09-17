import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { Operation } from "@/models/Operation";
import { guardObjectId } from "@/lib/mongo-id";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  const body = await req.json();

  if (!body.photo || typeof body.photo !== "string") {
    return NextResponse.json({ error: "Photo requise (base64 data URL)" }, { status: 400 });
  }

  if (!body.photo.startsWith("data:image/")) {
    return NextResponse.json({ error: "Format de photo invalide" }, { status: 400 });
  }

  const sizeInBytes = Math.ceil((body.photo.length * 3) / 4);
  if (sizeInBytes > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "La photo dépasse 10 Mo" }, { status: 400 });
  }

  await connectDB();
  const operation = await Operation.findById(id);
  if (!operation) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });

  if ((operation.photos?.length ?? 0) >= 10) {
    return NextResponse.json({ error: "Maximum de 10 photos atteint" }, { status: 400 });
  }

  const photo = {
    url: body.photo,
    nom: body.nom || `photo-${Date.now()}.jpg`,
    uploadedAt: new Date(),
  };

  operation.photos.push(photo);
  await operation.save();

  return NextResponse.json({ photo }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  const body = await req.json();

  if (!body.url) {
    return NextResponse.json({ error: "URL de la photo requise" }, { status: 400 });
  }

  await connectDB();
  const operation = await Operation.findById(id);
  if (!operation) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });

  operation.photos = operation.photos.filter((p: { url: string }) => p.url !== body.url);
  await operation.save();

  return NextResponse.json({ success: true });
}
