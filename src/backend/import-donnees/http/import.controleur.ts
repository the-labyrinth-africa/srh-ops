import { NextRequest, NextResponse } from "next/server";
import { requireInternalAuth } from "@/backend/comptes";
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { casDUsageImport } from "../composition";
import { AucuneLigneExploitable, ClientIntrouvable } from "../domain/erreurs";
import { NATURE_PAR_DEFAUT } from "../domain/import";

/** Le lecteur charge tout le classeur en mémoire : on borne l'entrée. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const NEUTRAL_MIMES = ["", "application/octet-stream", "application/x-zip-compressed", "application/zip"];

const MESSAGE_FORMAT = "Format de fichier non supporté : seuls les fichiers .xlsx sont acceptés.";
const MESSAGE_TROP_LOURD = "Le fichier dépasse 5 Mo. Découpez le classeur avant de l'importer.";

function hasXlsxExtension(name: string): boolean {
  return /\.xlsx$/i.test(name.trim());
}

function validateImportBody(body: unknown) {
  if (!body || typeof body !== "object") {
    return {
      fileName: null as string | null,
      clientId: null as string | null,
      natureIntervention: NATURE_PAR_DEFAUT,
      mode: "import" as "preview" | "import",
      buffer: null as Buffer | null,
    };
  }

  const obj = body as Record<string, unknown>;
  const fileName = typeof obj.fileName === "string" && obj.fileName ? obj.fileName : "interventions.xlsx";
  const clientId = typeof obj.clientId === "string" && obj.clientId ? obj.clientId : null;
  const natureIntervention =
    typeof obj.natureIntervention === "string" && obj.natureIntervention.trim()
      ? obj.natureIntervention.trim()
      : NATURE_PAR_DEFAUT;
  const mode = obj.mode === "preview" ? "preview" : "import";
  let buffer: Buffer | null = null;

  if (typeof obj.fileBase64 === "string" && obj.fileBase64) {
    const base64 = obj.fileBase64.replace(/^data:.+;base64,/, "");
    buffer = Buffer.from(base64, "base64");
  }

  return { fileName, clientId, natureIntervention, mode, buffer };
}

export async function POST(req: NextRequest) {
  const auth = await requireInternalAuth(true);
  if (auth.error) return auth.error;

  let fileName: string;
  let clientId: string | null;
  let natureIntervention: string;
  let mode: "preview" | "import";
  let buffer: Buffer | null;

  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file");
    clientId = (formData.get("clientId") as string) || null;
    natureIntervention = (formData.get("natureIntervention") as string)?.trim() || NATURE_PAR_DEFAUT;
    mode = formData.get("mode") === "preview" ? "preview" : "import";

    if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }

    const fileBlob = file as unknown as Blob;
    fileName = (file as unknown as File).name || "interventions.xlsx";

    const mimeType = (fileBlob.type || "").toLowerCase();
    if (mimeType !== XLSX_MIME && !NEUTRAL_MIMES.includes(mimeType)) {
      return NextResponse.json({ error: MESSAGE_FORMAT }, { status: 400 });
    }
    if (fileBlob.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: MESSAGE_TROP_LOURD }, { status: 413 });
    }

    const arrayBuffer = await fileBlob.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else {
    const body = await req.json();
    const parsed = validateImportBody(body);
    buffer = parsed.buffer;
    fileName = parsed.fileName ?? "interventions.xlsx";
    clientId = parsed.clientId;
    natureIntervention = parsed.natureIntervention || NATURE_PAR_DEFAUT;
    mode = parsed.mode === "preview" ? "preview" : "import";
  }

  if (!buffer || buffer.length === 0) {
    return NextResponse.json({ error: "Fichier requis (multipart ou fileBase64)" }, { status: 400 });
  }

  if (!hasXlsxExtension(fileName)) {
    return NextResponse.json({ error: MESSAGE_FORMAT }, { status: 400 });
  }

  if (buffer.length > MAX_FILE_BYTES) {
    return NextResponse.json({ error: MESSAGE_TROP_LOURD }, { status: 413 });
  }

  let analyse;
  try {
    analyse = await casDUsageImport.analyser(buffer, fileName);
  } catch (erreur) {
    if (erreur instanceof AucuneLigneExploitable) {
      return NextResponse.json({ error: erreur.message, errors: erreur.erreurs }, { status: 422 });
    }
    throw erreur;
  }
  const summary = analyse.resume;

  if (mode === "preview") {
    return NextResponse.json({ preview: true, summary });
  }

  // ---- Import ----
  // I2 : le client cible est explicite, vérifié, et jamais créé à la volée.
  if (!clientId) {
    return NextResponse.json(
      { error: "Client requis : sélectionnez le client destinataire de l'import." },
      { status: 400 }
    );
  }

  const clientGuard = guardObjectId(clientId);
  if (!clientGuard.valid) return clientGuard.error;

  try {
    const resultat = await casDUsageImport.importer(analyse.lecture, clientId, natureIntervention);
    return NextResponse.json({
      import: true,
      summary,
      created: resultat.created,
      duplicates: resultat.duplicates,
      clientId: resultat.clientId,
    });
  } catch (erreur) {
    if (erreur instanceof ClientIntrouvable) {
      return NextResponse.json({ error: erreur.message }, { status: 404 });
    }
    throw erreur;
  }
}
