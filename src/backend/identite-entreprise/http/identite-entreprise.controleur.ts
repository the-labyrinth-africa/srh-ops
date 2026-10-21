import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/backend/comptes";
import { enregistrerIdentiteEntreprise, obtenirIdentiteEntreprise } from "../composition";
import { identiteEntrepriseSchema } from "./identite-entreprise.schema";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_LOGO_PNG_BYTES = 1024 * 1024;

export async function GET() {
  const auth = await requireAuth(false, {
    allowMustChangePassword: true,
    allowSuperadmin: true,
  });
  if (auth.error) return auth.error;

  const identite = await obtenirIdentiteEntreprise();
  return NextResponse.json(identite, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(false, { allowSuperadmin: true });
  if (auth.error) return auth.error;
  if (auth.user.role !== "superadmin") {
    return NextResponse.json({ error: "Accès réservé au super administrateur de la plateforme." }, { status: 403 });
  }

  const form = await request.formData();
  const parsed = identiteEntrepriseSchema.safeParse({
    nomEntreprise: form.get("nomEntreprise"),
    sigle: form.get("sigle"),
    siteWeb: form.get("siteWeb"),
    uniteQuantiteGlobale: form.get("uniteQuantiteGlobale") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Identité invalide." }, { status: 400 });
  }

  const existing = await obtenirIdentiteEntreprise();
  const removeLogo = form.get("removeLogo") === "true";
  const logoFile = form.get("logo");
  let logoDataUrl = removeLogo ? null : existing.logoDataUrl;

  if (logoFile && typeof logoFile !== "string" && logoFile.size > 0) {
    if (logoFile.size > MAX_LOGO_BYTES) {
      return NextResponse.json({ error: "Le logo doit peser au maximum 2 Mo." }, { status: 413 });
    }
    if (!["image/png", "image/jpeg"].includes(logoFile.type.toLowerCase())) {
      return NextResponse.json({ error: "Le logo doit être une image PNG ou JPEG." }, { status: 400 });
    }

    const input = Buffer.from(await logoFile.arrayBuffer());
    let png: Buffer;
    try {
      png = await sharp(input, { limitInputPixels: 12_000_000 })
        .rotate()
        .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer();
    } catch (error) {
      if (error instanceof Error) {
        return NextResponse.json({ error: "Le fichier choisi n'est pas une image lisible." }, { status: 400 });
      }
      throw error;
    }
    if (png.length > MAX_LOGO_PNG_BYTES) {
      return NextResponse.json({ error: "L'image reste trop volumineuse après traitement." }, { status: 413 });
    }
    logoDataUrl = `data:image/png;base64,${png.toString("base64")}`;
  }

  const identite = await enregistrerIdentiteEntreprise({
    ...parsed.data,
    logoDataUrl,
    uniteQuantiteGlobale:
      parsed.data.uniteQuantiteGlobale === undefined
        ? existing.uniteQuantiteGlobale
        : parsed.data.uniteQuantiteGlobale || null,
  });
  return NextResponse.json(identite, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
