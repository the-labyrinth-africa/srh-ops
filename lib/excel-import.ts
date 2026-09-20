import ExcelJS from "exceljs";

export interface ExcelOperationRow {
  site: string;
  date: Date;
  quantite: number;
  rowNumber: number;
}

export interface ExcelParseResult {
  rows: ExcelOperationRow[];
  skippedRows: number;
  errors: { row: number; message: string }[];
  fileName: string;
}

const SITE_HEADERS = ["site", "sites", "nom du site", "nom de site", "nom site", "point de collecte", "points", "site d'intervention", "collecte", "ville", "quartier"];
const DATE_HEADERS = ["date", "dates", "date de collecte", "date prevue", "date prévue", "date intervention", "jour", "journee", "journée"];
const QUANTITE_HEADERS = ["qte", "qtes", "quantite", "quantite", "quantité", "qté", "volume", "litres", "l", "quantite collectee", "quantité collectée", "valeur"];

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9êéèàô/]/g, "")
    .trim();
}

function matchesAny(value: string, headers: string[]): boolean {
  const norm = normalizeHeader(value);
  if (!norm) return false;
  return headers.some((h) => norm === normalizeHeader(h) || norm.includes(normalizeHeader(h)) || normalizeHeader(h).includes(norm));
}

function parseDate(value: ExcelJS.CellValue, rowNumber: number): { date?: Date; error?: string } {
  if (value instanceof Date) return { date: value };
  if (typeof value === "number") {
    // Excel serial date (days since 1900-01-01)
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return { date };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();

    // Format français d'abord : "05/06/2026" est le 5 juin, pas le 6 mai.
    // `new Date(string)` interprète jj/mm/aaaa comme mm/jj/aaaa et doit donc
    // être essayé en dernier seulement.
    const fr = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
    if (fr) {
      const day = Number(fr[1]);
      const month = Number(fr[2]);
      const year = fr[3].length === 2 ? 2000 + Number(fr[3]) : Number(fr[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const parsed = new Date(year, month - 1, day);
        if (!isNaN(parsed.getTime())) return { date: parsed };
      }
      return { error: `Date invalide à la ligne ${rowNumber}: "${value}"` };
    }

    // Format ISO aaaa-mm-jj : construit en heure locale pour éviter le décalage
    // d'un jour introduit par l'interprétation UTC de `new Date`.
    const iso = trimmed.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
    if (iso) {
      const parsed = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      if (!isNaN(parsed.getTime())) return { date: parsed };
    }

    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) return { date };

    return { error: `Date invalide à la ligne ${rowNumber}: "${value}"` };
  }
  return { error: `Date non reconnue à la ligne ${rowNumber}` };
}

/**
 * Renvoie `quantite: undefined` quand la cellule est vide. Le client SRH n'a pas
 * de collecte à quantité nulle : une absence de quantité n'est pas un zéro.
 */
function parseQuantite(value: ExcelJS.CellValue, rowNumber: number): { quantite?: number; error?: string } {
  if (value === undefined || value === null || value === "") return {};
  if (typeof value === "number") return { quantite: value };
  if (typeof value === "string") {
    const num = parseFloat(value.replace(",", ".").replace(/[^0-9.\-]/g, ""));
    if (!isNaN(num)) return { quantite: num };
  }
  return { error: `Quantité invalide à la ligne ${rowNumber}: "${String(value)}"` };
}

export async function parseExcelFile(buffer: Buffer, fileName: string): Promise<ExcelParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const result: ExcelParseResult = { rows: [], skippedRows: 0, errors: [], fileName };
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    result.errors.push({ row: 0, message: "Aucune feuille de calcul trouvée." });
    return result;
  }

  let headerRowIndex = -1;
  let colSite = -1;
  let colDate = -1;
  let colQuantite = -1;

  // Detect header row by scanning the first 12 rows
  for (let r = 1; r <= Math.min(12, worksheet.rowCount); r++) {
    const row = worksheet.getRow(r);
    const cells: Record<string, string> = {};
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (typeof cell.value === "string" || typeof cell.value === "number") {
        cells[cell.col] = String(cell.value);
      }
    });

    const headers = Object.entries(cells);
    if (headers.length === 0) continue;

    let detected = 0;
    let siteCol = -1;
    let dateCol = -1;
    let qteCol = -1;

    for (const [col, value] of headers) {
      const colNum = parseInt(col, 10);
      if (siteCol === -1 && matchesAny(value, SITE_HEADERS)) {
        siteCol = colNum;
        detected++;
      } else if (dateCol === -1 && matchesAny(value, DATE_HEADERS)) {
        dateCol = colNum;
        detected++;
      } else if (qteCol === -1 && matchesAny(value, QUANTITE_HEADERS)) {
        qteCol = colNum;
        detected++;
      }
    }

    if (detected >= 2) {
      headerRowIndex = r;
      colSite = siteCol;
      colDate = dateCol;
      colQuantite = qteCol;
      break;
    }
  }

  if (headerRowIndex === -1) {
    result.errors.push({
      row: 0,
      message:
        "Impossible de détecter les colonnes (SITES, DATES, QTES). Vérifiez que la première feuille contient ces en-têtes sur les 12 premières lignes.",
    });
    return result;
  }

  for (let r = headerRowIndex + 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);

    const getVal = (col: number): ExcelJS.CellValue | undefined => {
      if (col < 0) return undefined;
      const cell = row.getCell(col);
      return cell.value;
    };

    const siteVal = getVal(colSite);
    const dateVal = getVal(colDate);
    const qteVal = colQuantite >= 0 ? getVal(colQuantite) : undefined;

    const siteStr =
      typeof siteVal === "string"
        ? siteVal.trim()
        : typeof siteVal === "number"
        ? String(siteVal).trim()
        : siteVal instanceof Date
        ? siteVal.toLocaleDateString("fr-FR")
        : "";

    if (!siteStr && dateVal === undefined && qteVal === undefined) {
      result.skippedRows++;
      continue;
    }

    // Skip summary / formula rows (e.g., SUM(...) in a cell)
    let hasFormula = false;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.value && typeof cell.value === "object" && "result" in (cell.value as object)) {
        hasFormula = true;
      }
    });
    if (hasFormula && (qteVal === undefined || typeof qteVal !== "number")) {
      result.skippedRows++;
      continue;
    }

    if (!siteStr) {
      result.skippedRows++;
      continue;
    }

    const { date, error: dateError } = parseDate(dateVal, r);
    if (dateError) {
      result.errors.push({ row: r, message: dateError });
      result.skippedRows++;
      continue;
    }
    if (!date) {
      result.errors.push({ row: r, message: `Date manquante à la ligne ${r}` });
      result.skippedRows++;
      continue;
    }

    const { quantite, error: qteError } = parseQuantite(qteVal, r);
    if (qteError) {
      result.errors.push({ row: r, message: qteError });
      result.skippedRows++;
      continue;
    }

    // Une quantité nulle ou absente n'est pas une collecte : la ligne est
    // ignorée et signalée dans le compte rendu.
    if (quantite === undefined || quantite <= 0) {
      result.errors.push({
        row: r,
        message: `Ligne ${r} ignorée : quantité nulle ou absente`,
      });
      result.skippedRows++;
      continue;
    }

    result.rows.push({
      site: siteStr,
      date,
      quantite,
      rowNumber: r,
    });
  }

  result.rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  return result;
}