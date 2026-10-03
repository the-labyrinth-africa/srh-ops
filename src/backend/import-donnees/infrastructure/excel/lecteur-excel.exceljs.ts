import ExcelJS from "exceljs";

import type { LecteurExcel } from "../../domain/ports";
import {
  ENTETES_DATE,
  ENTETES_QUANTITE,
  ENTETES_SITE,
  correspondAUnEntete,
  interpreterDate,
  interpreterQuantite,
  type LectureClasseur,
} from "../../domain/lecture";

/**
 * Parcours du classeur (première feuille) : repérage de la ligne d'en-têtes dans les douze
 * premières lignes, puis lecture ligne à ligne. L'interprétation des cellules (dates, quantités,
 * en-têtes) est faite par les règles pures du domaine.
 */
export async function parseExcelFile(buffer: Uint8Array, fileName: string): Promise<LectureClasseur> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const result: LectureClasseur = { rows: [], skippedRows: 0, errors: [], fileName };
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
      if (siteCol === -1 && correspondAUnEntete(value, ENTETES_SITE)) {
        siteCol = colNum;
        detected++;
      } else if (dateCol === -1 && correspondAUnEntete(value, ENTETES_DATE)) {
        dateCol = colNum;
        detected++;
      } else if (qteCol === -1 && correspondAUnEntete(value, ENTETES_QUANTITE)) {
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

    const { date, error: dateError } = interpreterDate(dateVal, r);
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

    const { quantite, error: qteError } = interpreterQuantite(qteVal, r);
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

export class LecteurExcelJs implements LecteurExcel {
  lire(contenu: Uint8Array, nomFichier: string): Promise<LectureClasseur> {
    return parseExcelFile(contenu, nomFichier);
  }
}
