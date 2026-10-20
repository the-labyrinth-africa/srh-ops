import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseExcelFile } from "./lecteur-excel.exceljs";

async function classeurBuffer(lignes: (string | number | Date | null)[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Feuil1");
  for (const ligne of lignes) worksheet.addRow(ligne);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("parseExcelFile", () => {
  it("repère les trois colonnes requises après des lignes de titre", async () => {
    const buffer = await classeurBuffer([
      ["Récapitulatif des collectes"],
      ["SITES", "DATES", "QTES"],
      ["Site Central", new Date(2026, 5, 11), 250],
      [null, null, null],
      ["Site sans collecte", new Date(2026, 5, 12), 0],
    ]);

    const resultat = await parseExcelFile(buffer, "recap.xlsx");

    expect(resultat.rows).toHaveLength(1);
    expect(resultat.rows[0]).toMatchObject({ site: "Site Central", quantite: 250, rowNumber: 3 });
    expect(resultat.skippedRows).toBe(1);
    expect(resultat.errors).toHaveLength(1);
  });

  it("refuse une ligne d'en-têtes où une colonne obligatoire manque", async () => {
    const buffer = await classeurBuffer([
      ["SITES", "DATES"],
      ["Site Central", new Date(2026, 5, 11)],
    ]);

    const resultat = await parseExcelFile(buffer, "incomplet.xlsx");

    expect(resultat.rows).toEqual([]);
    expect(resultat.errors).toEqual([
      {
        row: 0,
        message: expect.stringContaining("SITES, DATES et QTES"),
      },
    ]);
  });
});
