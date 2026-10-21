import { describe, expect, it } from "vitest";
import { QUANTITE_UNITES } from "@/shared/operations/quantites";
import { identiteEntrepriseSchema } from "./identite-entreprise.schema";

const identiteValide = {
  nomEntreprise: "Entreprise Exemple",
  sigle: "EX",
  siteWeb: "https://exemple.com",
};

describe("identiteEntrepriseSchema", () => {
  it("accepte le nom, le sigle et un site web HTTPS", () => {
    expect(identiteEntrepriseSchema.safeParse(identiteValide).success).toBe(true);
  });

  it("accepte un site web facultatif, mais refuse HTTP", () => {
    expect(identiteEntrepriseSchema.safeParse({ ...identiteValide, siteWeb: "" }).success).toBe(true);
    expect(identiteEntrepriseSchema.safeParse({ ...identiteValide, siteWeb: "http://exemple.com" }).success).toBe(false);
  });

  it.each(QUANTITE_UNITES)("accepte %s comme unité globale", (unite) => {
    expect(identiteEntrepriseSchema.safeParse({ ...identiteValide, uniteQuantiteGlobale: unite }).success).toBe(true);
  });

  it("accepte l'absence ou la remise à zéro de l'unité globale", () => {
    expect(identiteEntrepriseSchema.safeParse(identiteValide).success).toBe(true);
    expect(identiteEntrepriseSchema.safeParse({ ...identiteValide, uniteQuantiteGlobale: "" }).success).toBe(true);
  });

  it("refuse une unité hors de la liste", () => {
    expect(
      identiteEntrepriseSchema.safeParse({ ...identiteValide, uniteQuantiteGlobale: "Tonnes" }).success
    ).toBe(false);
  });
});
