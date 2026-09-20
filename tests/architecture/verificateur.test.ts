// tests/architecture/verificateur.test.ts
import { describe, it, expect } from "vitest";
import { verifierImports } from "./verificateur";

const contexte = {
  domainesBackendMigres: ["equipes"],
  fonctionnalitesFrontendMigrees: ["equipes"],
};

const v = (fichier: string, imports: string[]) => verifierImports(fichier, imports, contexte);

describe("R1 — domain", () => {
  const f = "src/backend/equipes/domain/equipe.ts";
  it("accepte shared et son propre domain", () => {
    expect(v(f, ["@/shared/acces/roles", "./erreurs"])).toEqual([]);
  });
  it("refuse mongoose, application, infrastructure et le code hérité", () => {
    expect(v(f, ["mongoose"]).length).toBe(1);
    expect(v(f, ["../application/cas-d-usage"]).length).toBe(1);
    expect(v(f, ["@/lib/utils"]).length).toBe(1);
  });
});

describe("R2 — application", () => {
  const f = "src/backend/equipes/application/cas-d-usage.ts";
  it("accepte domain, shared et application du même domaine", () => {
    expect(v(f, ["../domain/equipe", "@/shared/acces/roles", "./autre"])).toEqual([]);
  });
  it.each(["mongoose", "next/server", "next-auth", "nodemailer", "bcryptjs", "jspdf", "exceljs"])(
    "refuse %s",
    (paquet) => {
      expect(v(f, [paquet]).length).toBe(1);
    }
  );
  it("refuse infrastructure, http et le code hérité", () => {
    expect(v(f, ["../infrastructure/mongoose/equipe.model"]).length).toBe(1);
    expect(v(f, ["../http/equipes.controleur"]).length).toBe(1);
    expect(v(f, ["@/models/User"]).length).toBe(1);
  });
});

describe("R3 — http et infrastructure", () => {
  it("http n'importe pas infrastructure (sauf composition.ts)", () => {
    expect(v("src/backend/equipes/http/liste.controleur.ts", ["../infrastructure/mongoose/x"]).length).toBe(1);
    expect(v("src/backend/equipes/http/liste.controleur.ts", ["../composition"])).toEqual([]);
  });
  it("infrastructure n'importe pas http", () => {
    expect(v("src/backend/equipes/infrastructure/mongoose/x.ts", ["../../http/y"]).length).toBe(1);
  });
});

describe("R4 — frontend", () => {
  it("le frontend n'importe jamais le backend", () => {
    expect(v("src/frontend/equipes/pages/PageEquipes.tsx", ["@/backend/equipes/index"]).length).toBe(1);
    expect(v("src/frontend/design-system/x.tsx", ["@/backend/platform/http/identifiants"]).length).toBe(1);
  });
  it("accepte shared, design-system et sa propre fonctionnalité", () => {
    expect(
      v("src/frontend/equipes/pages/PageEquipes.tsx", [
        "@/shared/acces/permissions",
        "@/frontend/design-system/EntityModal",
        "../api/chemins",
        "react",
      ])
    ).toEqual([]);
  });
});

describe("R5 — domaines entre eux", () => {
  it("un domaine migré n'importe un autre domaine que par son index", () => {
    const f = "src/backend/equipes/infrastructure/mongoose/x.ts";
    expect(v(f, ["@/backend/comptes/index"])).toEqual([]);
    expect(v(f, ["@/backend/comptes/infrastructure/mongoose/utilisateur.model"]).length).toBe(1);
  });
  it("accepte platform", () => {
    expect(v("src/backend/equipes/infrastructure/mongoose/x.ts", ["@/backend/platform/base-de-donnees/connexion"])).toEqual([]);
  });
});

describe("modules non migrés", () => {
  it("ne sont pas contraints", () => {
    expect(v("src/backend/operations/domain/x.ts", ["mongoose"])).toEqual([]);
  });
});
