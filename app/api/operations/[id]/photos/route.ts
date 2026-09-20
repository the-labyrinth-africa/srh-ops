import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireTerrainWrite, isWithinTeamScope, chauffeurWithoutTeamError, TEAM_SCOPE_ERROR } from "@/lib/api-auth";
import { Operation } from "@/models/Operation";
import { guardObjectId } from "@/lib/mongo-id";

type Params = { params: Promise<{ id: string }> };

/**
 * Les photos sont stockées en base64 dans le document Operation (limite BSON de
 * 16 Mo). Plafonds volontairement bas pour garder de la marge : 2 Mo par photo
 * et 8 Mo cumulés par opération, mesurés sur la charge utile réellement stockée.
 */
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_PHOTOS_TOTAL_BYTES = 8 * 1024 * 1024;

function storedBytes(dataUrl: string): number {
  return Buffer.byteLength(dataUrl, "utf8");
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireTerrainWrite();
  if (auth.error) return auth.error;
  const noTeam = chauffeurWithoutTeamError(auth);
  if (noTeam) return noTeam;

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

  const photoBytes = storedBytes(body.photo);
  if (photoBytes > MAX_PHOTO_BYTES) {
    return NextResponse.json(
      { error: "La photo dépasse 2 Mo. Réduisez sa taille avant l'envoi." },
      { status: 413 }
    );
  }

  await connectDB();
  const operation = await Operation.findById(id);
  if (!operation) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });

  if (!isWithinTeamScope(auth, operation.equipeId)) {
    return NextResponse.json({ error: TEAM_SCOPE_ERROR }, { status: 403 });
  }

  if ((operation.photos?.length ?? 0) >= 10) {
    return NextResponse.json({ error: "Maximum de 10 photos atteint" }, { status: 400 });
  }

  const existingBytes = (operation.photos ?? []).reduce(
    (sum: number, p: { url?: string }) => sum + storedBytes(p.url ?? ""),
    0
  );
  if (existingBytes + photoBytes > MAX_PHOTOS_TOTAL_BYTES) {
    return NextResponse.json(
      { error: "Les photos de cette opération dépassent 8 Mo au total." },
      { status: 413 }
    );
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
  const auth = await requireTerrainWrite();
  if (auth.error) return auth.error;
  const noTeam = chauffeurWithoutTeamError(auth);
  if (noTeam) return noTeam;

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

  if (!isWithinTeamScope(auth, operation.equipeId)) {
    return NextResponse.json({ error: TEAM_SCOPE_ERROR }, { status: 403 });
  }

  // La suppression ne porte que sur une photo rattachée à cette opération.
  operation.photos = operation.photos.filter((p: { url: string }) => p.url !== body.url);
  await operation.save();

  return NextResponse.json({ success: true });
}
