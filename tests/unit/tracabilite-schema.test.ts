import { describe, expect, it } from "vitest";
import { traceabiliteSchema } from "@/backend/tracabilite/http/tracabilite.schema";

const VALIDE = {
  identifiantSuivi: "BSD-2026/001",
  typeDechet: "Huiles usagées",
  volume: 250,
  unite: "Litres",
  traitement: "Valorisation",
};

describe("traceabiliteSchema", () => {
  it("accepte les identifiants de suivi, flux et traitements valides", () => {
    expect(traceabiliteSchema.safeParse(VALIDE).success).toBe(true);
  });

  it.each([0, -1, "abc"])("refuse un volume non positif ou invalide (%s)", (volume) => {
    expect(traceabiliteSchema.safeParse({ ...VALIDE, volume }).success).toBe(false);
  });

  it("refuse les unités inconnues, champs manquants et champs inattendus", () => {
    expect(traceabiliteSchema.safeParse({ ...VALIDE, unite: "Tonnes" }).success).toBe(false);
    expect(traceabiliteSchema.safeParse({ ...VALIDE, traitement: "" }).success).toBe(false);
    expect(traceabiliteSchema.safeParse({ ...VALIDE, extra: true }).success).toBe(false);
  });

  it("accepte les accents dans les identifiants et rejette les identifiants vides ou mal formés", () => {
    expect(traceabiliteSchema.safeParse({ ...VALIDE, identifiantSuivi: "Déchet-2026.1" }).success).toBe(true);
    expect(traceabiliteSchema.safeParse({ ...VALIDE, identifiantSuivi: "?" }).success).toBe(false);
    expect(traceabiliteSchema.safeParse({ ...VALIDE, identifiantSuivi: " " }).success).toBe(false);
  });
});
