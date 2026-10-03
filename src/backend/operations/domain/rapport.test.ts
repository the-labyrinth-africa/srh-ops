import { describe, it, expect } from "vitest";
import { nomFichierRapport, referenceRapport } from "./rapport";

describe("référence et nom de fichier du rapport", () => {
  it("référence : les huit derniers caractères de l'identifiant, en majuscules", () => {
    expect(referenceRapport("6ac0f07a0086aca5b0ced976")).toBe("B0CED976");
  });

  it("identifiant plus court que huit caractères : repris en entier", () => {
    expect(referenceRapport("abc")).toBe("ABC");
  });

  it("nom de fichier : rapport-<référence>.pdf", () => {
    expect(nomFichierRapport("6ac0f07a0086aca5b0ced976")).toBe("rapport-B0CED976.pdf");
  });
});
