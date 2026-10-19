import { describe, expect, it } from "vitest";
import { exporterOperationsCsv } from "./export-csv";

describe("exporterOperationsCsv", () => {
  it("inclut les en-têtes, le BOM UTF-8 et le statut effectif", () => {
    const csv = exporterOperationsCsv(
      [{
        id: "abc",
        client: "SRH",
        site: "Abidjan",
        natureIntervention: "Collecte",
        dateHeurePrevue: new Date("2030-11-02T10:00:00.000Z"),
        statut: "Planifiée",
      }],
      new Date("2030-11-04T10:00:00.000Z")
    );

    expect(csv).toContain('\uFEFF"Identifiant";"Client";"Site";"Intervention"');
    expect(csv).toContain('"abc";"SRH";"Abidjan";"Collecte"');
    expect(csv).toContain('"Retardée"');
  });

  it("échappe les séparateurs, les guillemets et les formules Excel", () => {
    const csv = exporterOperationsCsv(
      [{
        id: "abc",
        client: "=HYPERLINK(\"https://example.invalid\")",
        site: "Site; zone A",
        natureIntervention: "Nettoyage",
        dateHeurePrevue: new Date("2030-11-09T10:00:00.000Z"),
        statut: "Affectée",
        quantiteCollectee: 5,
        uniteQuantite: "Litres",
      }],
      new Date("2030-11-04T10:00:00.000Z")
    );

    expect(csv).toContain(`"'=HYPERLINK(""https://example.invalid"")"`);
    expect(csv).toContain('"Site; zone A"');
    expect(csv).toContain('"5";"Litres"');
  });
});
