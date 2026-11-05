import { describe, it, expect } from "vitest";
import { dateHeurePrevueImportee, historiqueImporte, normaliserNomSite, resumerLecture } from "./import";
import type { LectureClasseur } from "./lecture";

const J11 = new Date(2026, 5, 11);
const J19 = new Date(2026, 5, 19);

describe("normaliserNomSite", () => {
  it("retire les espaces autour et met en minuscules", () => {
    expect(normaliserNomSite("  PO Anoumabo ")).toBe("po anoumabo");
  });
});

describe("dateHeurePrevueImportee", () => {
  it("le jour de la collecte, à 08:00 heure locale, sans modifier la date d'origine", () => {
    const origine = new Date(2026, 5, 11, 15, 30);
    expect(dateHeurePrevueImportee(origine)).toEqual(new Date(2026, 5, 11, 8, 0, 0, 0));
    expect(origine).toEqual(new Date(2026, 5, 11, 15, 30));
  });
});

describe("historiqueImporte", () => {
  it("n'enregistre que le statut rapporté, sans inventer les étapes antérieures", () => {
    const prevue = new Date(2026, 5, 11, 8, 0);
    expect(historiqueImporte(prevue)).toEqual([{ statut: "Rapportée", date: prevue }]);
  });
});

describe("resumerLecture", () => {
  const lecture = (rows: LectureClasseur["rows"]): LectureClasseur => ({
    rows,
    skippedRows: 2,
    errors: [{ row: 9, message: "Ligne 9 ignorée : quantité nulle ou absente" }],
    fileName: "recap.xlsx",
  });

  it("totaux, sites distincts (noms bruts), bornes de date, unité d'aperçu", () => {
    const rows = [
      { site: "pmc", date: J11, quantite: 200, rowNumber: 2 },
      { site: "PMC", date: J19, quantite: 300.5, rowNumber: 3 },
      { site: "pmc", date: J19, quantite: 10, rowNumber: 4 },
    ];
    expect(resumerLecture(lecture(rows))).toEqual({
      fileName: "recap.xlsx",
      totalRows: 3,
      skippedRows: 2,
      errors: [{ row: 9, message: "Ligne 9 ignorée : quantité nulle ou absente" }],
      uniqueSites: 2,
      totalQuantite: 510.5,
      uniteApercu: "Litres",
      dateMin: J11.toISOString(),
      dateMax: J19.toISOString(),
      apercu: rows,
    });
  });

  it("inclut toutes les lignes pour permettre d'afficher l'aperçu complet", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ site: `s${i}`, date: J11, quantite: 1, rowNumber: i + 2 }));
    const resume = resumerLecture(lecture(rows));
    expect(resume.apercu).toHaveLength(12);
    expect(resume.apercu[11].site).toBe("s11");
    expect(resume.totalRows).toBe(12);
  });
});
