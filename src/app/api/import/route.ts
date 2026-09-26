import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import { requireInternalAuth } from "@/backend/comptes";
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { parseExcelFile } from "@/lib/excel-import";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Site } from "@/backend/clients-sites/infrastructure/mongoose/site.model";
import { Operation } from "@/models/Operation";
import type { OperationStatus } from "@/shared/operations/statuts";

const DEFAULT_NATURE = "Collecte d'huiles usagées";

/** Le parseur charge tout le classeur en mémoire : on borne l'entrée. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const NEUTRAL_MIMES = ["", "application/octet-stream", "application/x-zip-compressed", "application/zip"];

function hasXlsxExtension(name: string): boolean {
  return /\.xlsx$/i.test(name.trim());
}

function validateImportBody(body: unknown) {
  if (!body || typeof body !== "object") {
    return {
      fileName: null as string | null,
      clientId: null as string | null,
      natureIntervention: DEFAULT_NATURE,
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
      : DEFAULT_NATURE;
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
    natureIntervention =
      (formData.get("natureIntervention") as string)?.trim() || DEFAULT_NATURE;
    mode = formData.get("mode") === "preview" ? "preview" : "import";

    if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }

    const fileBlob = file as unknown as Blob;
    fileName = (file as unknown as File).name || "interventions.xlsx";

    const mimeType = (fileBlob.type || "").toLowerCase();
    if (mimeType !== XLSX_MIME && !NEUTRAL_MIMES.includes(mimeType)) {
      return NextResponse.json(
        { error: "Format de fichier non supporté : seuls les fichiers .xlsx sont acceptés." },
        { status: 400 }
      );
    }
    if (fileBlob.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "Le fichier dépasse 5 Mo. Découpez le classeur avant de l'importer." },
        { status: 413 }
      );
    }

    const arrayBuffer = await fileBlob.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else {
    const body = await req.json();
    const parsed = validateImportBody(body);
    buffer = parsed.buffer;
    fileName = parsed.fileName ?? "interventions.xlsx";
    clientId = parsed.clientId;
    natureIntervention = parsed.natureIntervention || DEFAULT_NATURE;
    mode = parsed.mode === "preview" ? "preview" : "import";
  }

  if (!buffer || buffer.length === 0) {
    return NextResponse.json({ error: "Fichier requis (multipart ou fileBase64)" }, { status: 400 });
  }

  if (!hasXlsxExtension(fileName)) {
    return NextResponse.json(
      { error: "Format de fichier non supporté : seuls les fichiers .xlsx sont acceptés." },
      { status: 400 }
    );
  }

  if (buffer.length > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "Le fichier dépasse 5 Mo. Découpez le classeur avant de l'importer." },
      { status: 413 }
    );
  }

  const parseResult = await parseExcelFile(buffer, fileName);

  if (parseResult.rows.length === 0) {
    return NextResponse.json(
      {
        error:
          parseResult.errors[0]?.message ||
          "Aucune ligne exploitable détectée dans le fichier.",
        errors: parseResult.errors,
      },
      { status: 422 }
    );
  }

  // Build preview summary
  const uniqueSites = [...new Set(parseResult.rows.map((r) => r.site))];
  const totalQte = parseResult.rows.reduce((sum, r) => sum + (r.quantite || 0), 0);
  const dateMin = new Date(Math.min(...parseResult.rows.map((r) => r.date.getTime())));
  const dateMax = new Date(Math.max(...parseResult.rows.map((r) => r.date.getTime())));

  const summary = {
    fileName: parseResult.fileName,
    totalRows: parseResult.rows.length,
    skippedRows: parseResult.skippedRows,
    errors: parseResult.errors,
    uniqueSites: uniqueSites.length,
    totalQuantite: totalQte,
    uniteApercu: "Litres",
    dateMin: dateMin.toISOString(),
    dateMax: dateMax.toISOString(),
    apercu: parseResult.rows.slice(0, 10),
  };

  if (mode === "preview") {
    return NextResponse.json({ preview: true, summary });
  }

  // ---- Import mode ----
  await connectDB();

  // I2 : le client cible est explicite, vérifié, et jamais créé à la volée.
  if (!clientId) {
    return NextResponse.json(
      { error: "Client requis : sélectionnez le client destinataire de l'import." },
      { status: 400 }
    );
  }

  const clientGuard = guardObjectId(clientId);
  if (!clientGuard.valid) return clientGuard.error;

  const client = await Client.findById(clientId);
  if (!client) {
    return NextResponse.json({ error: "Client introuvable." }, { status: 404 });
  }

  const clientObjId = client._id;

  // Resolve / create sites
  const siteCache = new Map<string, string>();
  for (const siteName of uniqueSites) {
    const normalized = siteName.trim().toLowerCase();
    // I1 : la recherche est bornée au client cible, sinon un site homonyme d'un
    // autre client se retrouve rattaché aux opérations importées.
    const existing = await Site.findOne({
      clientId: clientObjId,
      nom: { $regex: new RegExp(`^${escapeRegex(siteName.trim())}$`, "i") },
    });
    if (existing) {
      siteCache.set(normalized, String(existing._id));
      continue;
    }
    const site = new Site({
      clientId: clientObjId,
      nom: siteName.trim(),
      adresse: "",
      localisation: { lat: 0, lng: 0 },
      typeDechets: ["Huiles usagées"],
      observations: "Importé depuis un fichier Excel",
    });
    const saved = await site.save();
    siteCache.set(normalized, String(saved._id));
  }

  // Resolve unique dates per site to dedupe
  const created: string[] = [];
  const duplicates: string[] = [];
  let unchanged = 0;

  for (const row of parseResult.rows) {
    const siteId = siteCache.get(row.site.trim().toLowerCase());
    if (!siteId) continue;

    const dateHeurePrevue = new Date(row.date);
    dateHeurePrevue.setHours(8, 0, 0, 0);

    const existing = await Operation.findOne({
      siteId,
      dateHeurePrevue,
      quantiteCollectee: row.quantite,
    });

    if (existing) {
      duplicates.push(siteId);
      unchanged++;
      continue;
    }

    const history: { statut: OperationStatus; date: Date }[] = [
      { statut: "Planifiée", date: new Date(dateHeurePrevue.getTime() - 24 * 3600 * 1000) },
      { statut: "Affectée", date: new Date(dateHeurePrevue.getTime()) },
      { statut: "En route", date: new Date(dateHeurePrevue.getTime() + 30 * 60 * 1000) },
      { statut: "En cours", date: new Date(dateHeurePrevue.getTime() + 60 * 60 * 1000) },
      { statut: "Terminée", date: new Date(dateHeurePrevue.getTime() + 120 * 60 * 1000) },
      { statut: "Rapportée", date: new Date(dateHeurePrevue.getTime() + 180 * 60 * 1000) },
    ];

    const operation = new Operation({
      clientId: clientObjId,
      siteId,
      natureIntervention,
      dateHeurePrevue,
      dureeEstimeeMinutes: 120,
      informationsParticulieres: "",
      statut: "Rapportée",
      historiqueStatuts: history,
      quantiteCollectee: row.quantite,
      uniteQuantite: "Litres",
      remarquesTerrain: "Intervention importée depuis un fichier Excel",
      photos: [],
    });

    const saved = await operation.save();
    created.push(String(saved._id));
  }

  return NextResponse.json({
    import: true,
    summary,
    created: created.length,
    duplicates: unchanged,
    clientId: String(clientObjId),
  });
}

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}