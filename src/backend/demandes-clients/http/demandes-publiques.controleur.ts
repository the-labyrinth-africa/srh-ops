import { NextRequest, NextResponse } from "next/server";
import { notifierNouvelleDemande, traiterFileNotifications } from "@/backend/notifications";
import { runAfterResponse } from "@/backend/platform/execution-differee/execution-differee";
import { adresseIpDemande, casDUsageDemandes } from "../composition";
import { LimiteDemandesAtteinte } from "../domain/erreurs";
import { demandePubliqueSchema } from "./schemas";

const MAX_BODY_BYTES = 16_384;

async function lireCorpsLimite(request: NextRequest): Promise<string | NextResponse> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "La demande est trop volumineuse." }, { status: 413 });
  }

  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return NextResponse.json({ error: "La demande est trop volumineuse." }, { status: 413 });
      }
      chunks.push(value);
    }
  } catch (error) {
    console.error("[demandes-publiques] Lecture de la requête impossible :", error instanceof Error ? error.name : "erreur");
    return NextResponse.json({ error: "Impossible de traiter la demande." }, { status: 400 });
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function POST(request: NextRequest) {
  const ip = adresseIpDemande(request);
  if (ip === "unknown") {
    console.error("[demandes-publiques] Adresse IP non disponible pour le contrôle de débit.");
    return NextResponse.json({ error: "Service temporairement indisponible." }, { status: 503 });
  }

  try {
    await casDUsageDemandes.limiterIp(ip);
  } catch (error) {
    if (error instanceof LimiteDemandesAtteinte) {
      return NextResponse.json(
        { error: error.message },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } }
      );
    }
    console.error("[demandes-publiques] Limitation de débit indisponible :", error instanceof Error ? error.name : "erreur");
    return NextResponse.json({ error: "Service temporairement indisponible. Réessayez plus tard." }, { status: 503 });
  }

  const rawBody = await lireCorpsLimite(request);
  if (rawBody instanceof NextResponse) return rawBody;

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const parsed = demandePubliqueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const demande = await casDUsageDemandes.recevoir(parsed.data);
    await runAfterResponse(async () => {
      await notifierNouvelleDemande(demande);
      await traiterFileNotifications();
    });
    return NextResponse.json(
      { message: "Votre demande a été transmise à l'équipe pour vérification." },
      { status: 202, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof LimiteDemandesAtteinte) {
      return NextResponse.json(
        { error: error.message },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } }
      );
    }
    console.error("[demandes-publiques] Enregistrement impossible :", error instanceof Error ? error.name : "erreur");
    return NextResponse.json({ error: "Service temporairement indisponible. Réessayez plus tard." }, { status: 503 });
  }
}
