import { describe, expect, it } from "vitest";
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
});
