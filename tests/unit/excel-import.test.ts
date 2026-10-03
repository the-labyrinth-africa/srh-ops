import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseExcelFile } from "@/backend/import-donnees/infrastructure/excel/lecteur-excel.exceljs";

async function buildWorkbook(rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Feuil1");
  ws.addRow(["SITES", "DATES", "QTES"]);
  rows.forEach((row) => ws.addRow(row));
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

describe("parseExcelFile — dates (I4)", () => {
  it("lit une date texte au format jj/mm/aaaa et non mm/jj/aaaa", async () => {
    const buffer = await buildWorkbook([["site a", "05/06/2026", 200]]);
    const result = await parseExcelFile(buffer, "dates.xlsx");

    expect(result.rows).toHaveLength(1);
    const date = result.rows[0].date;
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5); // juin
    expect(date.getDate()).toBe(5);
  });

  it("lit une date texte dont le jour dépasse 12", async () => {
    const buffer = await buildWorkbook([["site a", "13/06/2026", 200]]);
    const result = await parseExcelFile(buffer, "dates.xlsx");

    expect(result.rows).toHaveLength(1);
    const date = result.rows[0].date;
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5);
    expect(date.getDate()).toBe(13);
  });

  it("accepte aussi les séparateurs - et .", async () => {
    const buffer = await buildWorkbook([
      ["site a", "07-06-2026", 200],
      ["site b", "08.06.2026", 300],
    ]);
    const result = await parseExcelFile(buffer, "dates.xlsx");

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].date.getDate()).toBe(7);
    expect(result.rows[0].date.getMonth()).toBe(5);
    expect(result.rows[1].date.getDate()).toBe(8);
    expect(result.rows[1].date.getMonth()).toBe(5);
  });

  it("laisse inchangées les cellules Date natives", async () => {
    const buffer = await buildWorkbook([["site a", new Date(2026, 5, 11), 200]]);
    const result = await parseExcelFile(buffer, "dates.xlsx");

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].date.getFullYear()).toBe(2026);
    expect(result.rows[0].date.getMonth()).toBe(5);
    expect(result.rows[0].date.getDate()).toBe(11);
  });

  it("laisse inchangés les numéros de série Excel", async () => {
    // 46184 = 11 juin 2026 dans le calendrier Excel (1900)
    const serial = 46184;
    const buffer = await buildWorkbook([["site a", serial, 200]]);
    const result = await parseExcelFile(buffer, "dates.xlsx");

    expect(result.rows).toHaveLength(1);
    const expected = new Date(Math.round((serial - 25569) * 86400 * 1000));
    expect(result.rows[0].date.getTime()).toBe(expected.getTime());
  });

  it("garde le format ISO aaaa-mm-jj", async () => {
    const buffer = await buildWorkbook([["site a", "2026-06-05", 200]]);
    const result = await parseExcelFile(buffer, "dates.xlsx");

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].date.getFullYear()).toBe(2026);
    expect(result.rows[0].date.getMonth()).toBe(5);
    expect(result.rows[0].date.getDate()).toBe(5);
  });
});

describe("parseExcelFile — quantités nulles (I5)", () => {
  it("ignore les lignes à quantité nulle ou absente et les signale", async () => {
    const buffer = await buildWorkbook([
      ["site a", new Date(2026, 5, 11), 200],
      ["site zero", new Date(2026, 5, 12), 0],
      ["site vide", new Date(2026, 5, 13), null],
    ]);
    const result = await parseExcelFile(buffer, "quantites.xlsx");

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].site).toBe("site a");
    expect(result.skippedRows).toBe(2);

    const messages = result.errors.map((e) => e.message).join(" | ");
    expect(messages).toContain("quantité nulle ou absente");
    expect(result.errors.map((e) => e.row).sort()).toEqual([3, 4]);
  });
});
