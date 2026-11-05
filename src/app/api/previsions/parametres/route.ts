import { NextResponse } from "next/server";
import { requireInternalAuth } from "@/backend/comptes";
import { enregistrerIdentiteEntreprise, obtenirIdentiteEntreprise } from "@/backend/identite-entreprise";

export async function GET() {
  const auth = await requireInternalAuth();
  if (auth.error) return auth.error;
  const identite = await obtenirIdentiteEntreprise();
  return NextResponse.json({ objectifLitresParStation: identite.objectifLitresParStation ?? 2000 });
}

export async function PUT(request: Request) {
  const auth = await requireInternalAuth(true);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null) as { objectifLitresParStation?: unknown } | null;
  const objectifLitresParStation = Number(body?.objectifLitresParStation);
  if (!Number.isInteger(objectifLitresParStation) || objectifLitresParStation < 1 || objectifLitresParStation > 1000000) {
    return NextResponse.json({ error: "L'objectif doit être un nombre entier positif de litres par station." }, { status: 400 });
  }
  const identite = await obtenirIdentiteEntreprise();
  await enregistrerIdentiteEntreprise({ ...identite, objectifLitresParStation });
  return NextResponse.json({ objectifLitresParStation });
}
