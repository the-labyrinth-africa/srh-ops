// tests/architecture/verificateur.test.ts
import { describe, it, expect } from "vitest";
import { verifierImports, AJOUT_HERITAGE, DOSSIERS_HERITES } from "./verificateur";

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

// ---------------------------------------------------------------------------
// Fix round 1 : garde-fous complétés.
// ---------------------------------------------------------------------------

describe("composition.ts (racine d'un domaine migré)", () => {
  const f = "src/backend/equipes/composition.ts";
  it("accepte son domain, application, infrastructure, shared, platform, paquets et le code hérité toléré", () => {
    expect(
      v(f, [
        "./domain/equipe",
        "./application/cas-d-usage",
        "./infrastructure/mongoose/equipe.model",
        "@/shared/acces/roles",
        "@/backend/platform/base-de-donnees/connexion",
        "mongoose",
        "@/models/User",
        "@/lib/auth",
      ])
    ).toEqual([]);
  });
  it("accepte l'index d'un autre domaine mais refuse ses internes", () => {
    expect(v(f, ["@/backend/comptes/index"])).toEqual([]);
    expect(v(f, ["@/backend/comptes/infrastructure/x"]).length).toBe(1);
    expect(v(f, ["@/backend/comptes/domain/x"]).length).toBe(1);
  });
  it("refuse http (composition est importée par http, jamais l'inverse)", () => {
    expect(v(f, ["./http/liste.controleur"]).length).toBe(1);
  });
});

describe("index.ts (racine d'un domaine migré)", () => {
  const f = "src/backend/equipes/index.ts";
  it("accepte application, domain, composition et shared", () => {
    expect(v(f, ["./application/cas-d-usage", "./domain/equipe", "./composition", "@/shared/acces/roles"])).toEqual([]);
  });
  it("refuse infrastructure, http, autres domaines, paquets et code hérité", () => {
    expect(v(f, ["./infrastructure/mongoose/x"]).length).toBe(1);
    expect(v(f, ["./http/x"]).length).toBe(1);
    expect(v(f, ["@/backend/comptes/domain/x"]).length).toBe(1);
    expect(v(f, ["@/backend/comptes/index"]).length).toBe(1);
    expect(v(f, ["mongoose"]).length).toBe(1);
    expect(v(f, ["@/lib/x"]).length).toBe(1);
  });
});

describe("structure d'un domaine migré", () => {
  it("signale un dossier ou fichier inconnu", () => {
    const a = v("src/backend/equipes/utils/x.ts", []);
    expect(a.length).toBe(1);
    expect(a[0]).toContain("dossier ou fichier inconnu");
    expect(v("src/backend/equipes/helper.ts", []).length).toBe(1);
  });
  it("accepte composition.ts, index.ts et les quatre couches", () => {
    for (const f of [
      "src/backend/equipes/composition.ts",
      "src/backend/equipes/index.ts",
      "src/backend/equipes/domain/a.ts",
      "src/backend/equipes/application/a.ts",
      "src/backend/equipes/infrastructure/a.ts",
      "src/backend/equipes/http/a.ts",
    ]) {
      expect(v(f, [])).toEqual([]);
    }
  });
  it("applique R5 et refuse l'héritage dans un dossier inconnu", () => {
    expect(v("src/backend/equipes/utils/x.ts", ["@/backend/comptes/infrastructure/x"]).length).toBe(2);
    expect(v("src/backend/equipes/utils/x.ts", ["@/lib/x"]).length).toBe(2);
  });
  it("ne contraint pas la structure d'un domaine non migré", () => {
    expect(v("src/backend/operations/utils/x.ts", ["mongoose"])).toEqual([]);
  });
});

describe("shared", () => {
  const f = "src/shared/acces/x.ts";
  it("accepte shared et les paquets neutres", () => {
    expect(v(f, ["./roles", "@/shared/statuts/y", "zod"])).toEqual([]);
  });
  it.each([
    "@/backend/equipes/domain/x",
    "@/frontend/x",
    "@/app/api/x",
    "mongoose",
    "next/server",
    "@/lib/x",
    "@/models/x",
    "@/components/x",
    "@/hooks/x",
    "@/types/x",
    "../../backend/x",
  ])("refuse %s", (spec) => {
    const r = v(f, [spec]);
    expect(r.length).toBe(1);
    expect(r[0]).toContain("R1");
  });
});

describe("R2 — un autre domaine, même par son index", () => {
  it("application ne parle qu'aux ports : l'index d'un autre domaine est interdit", () => {
    const r = v("src/backend/equipes/application/x.ts", ["@/backend/comptes/index"]);
    expect(r.length).toBe(1);
    expect(r[0]).toContain("R2");
  });
});

describe("R3 — sans exemption par nom de fichier", () => {
  it("un fichier http nommé composition.ts n'est pas exempté", () => {
    expect(v("src/backend/equipes/http/composition.ts", ["../infrastructure/mongoose/x"]).length).toBe(1);
  });
});

describe("paquets interdits : sous-chemins", () => {
  const f = "src/backend/equipes/application/cas-d-usage.ts";
  it.each([
    "mongoose/lib/x",
    "nodemailer/lib/x",
    "bcryptjs/dist/x",
    "exceljs/lib/x",
    "next/server",
    "next-auth/react",
    "jspdf-autotable",
    "jspdf/dist/x",
    "mongoose?raw",
    "mongoose#x",
  ])("refuse %s", (paquet) => {
    expect(v(f, [paquet]).length).toBe(1);
  });
  it("n'interdit pas les paquets voisins", () => {
    expect(v(f, ["nextjs-toolkit", "next-themes", "mongoose-lean"])).toEqual([]);
  });
});

describe("normalisation des spécificateurs", () => {
  it("ignore l'extension et la requête", () => {
    const f = "src/backend/equipes/infrastructure/mongoose/x.ts";
    expect(v(f, ["@/backend/comptes/index.ts"])).toEqual([]);
    expect(v(f, ["@/backend/comptes/index.js?x=1"])).toEqual([]);
    expect(v(f, ["@/backend/comptes/infrastructure/x.ts"]).length).toBe(1);
  });
  it("attrape les imports de dossier", () => {
    expect(v("src/backend/equipes/http/x.ts", ["../infrastructure"]).length).toBe(1);
    expect(v("src/backend/equipes/http/x.ts", ["@/backend/equipes/infrastructure"]).length).toBe(1);
    expect(v("src/backend/equipes/infrastructure/x.ts", ["../http"]).length).toBe(1);
  });
  it("normalise aussi la branche @/", () => {
    const f = "src/backend/equipes/infrastructure/mongoose/x.ts";
    expect(v(f, ["@/backend/platform/../comptes/domain/x"]).length).toBe(1);
    expect(v(f, ["@/backend/comptes/../platform/http/x"])).toEqual([]);
  });
});

describe("le backend n'importe jamais le frontend ni app", () => {
  it.each([
    "src/backend/operations/domain/x.ts",
    "src/backend/platform/http/x.ts",
    "src/backend/equipes/http/x.ts",
    "src/backend/equipes/composition.ts",
  ])("refuse dans %s", (f) => {
    const a = v(f, ["@/frontend/x"]);
    const b = v(f, ["@/app/api/x"]);
    expect(a.length).toBe(1);
    expect(b.length).toBe(1);
    expect(a[0]).toContain("R4-inverse");
  });
});

describe("platform n'importe aucun domaine", () => {
  it("refuse un domaine, même par son index", () => {
    expect(v("src/backend/platform/http/x.ts", ["@/backend/comptes/index"]).length).toBe(1);
    expect(v("src/backend/platform/http/x.ts", ["@/backend/equipes/domain/x"]).length).toBe(1);
  });
  it("accepte platform, shared et le code hérité", () => {
    expect(v("src/backend/platform/http/x.ts", ["../base-de-donnees/connexion", "@/shared/acces/roles", "@/lib/x"])).toEqual([]);
  });
  it("exception documentée : enregistrement-modeles.ts", () => {
    const f = "src/backend/platform/base-de-donnees/enregistrement-modeles.ts";
    expect(v(f, ["@/backend/equipes/infrastructure/mongoose/equipe.model", "@/models/Client"])).toEqual([]);
    expect(v("src/backend/platform/base-de-donnees/connexion.ts", ["@/backend/equipes/infrastructure/mongoose/equipe.model"]).length).toBe(1);
  });
});

describe("frontend : technologies et héritage", () => {
  it("refuse mongoose et les modèles hérités, même dans une fonctionnalité migrée", () => {
    expect(v("src/frontend/equipes/pages/P.tsx", ["mongoose"]).length).toBe(1);
    expect(v("src/frontend/equipes/pages/P.tsx", ["@/models/User"]).length).toBe(1);
    expect(v("src/frontend/design-system/x.tsx", ["mongoose"]).length).toBe(1);
  });
  it("tolère le reste de l'héritage (composants, hooks, lib) jusqu'à R9", () => {
    expect(v("src/frontend/equipes/pages/P.tsx", ["@/components/ui/x", "@/hooks/useX", "@/lib/utils"])).toEqual([]);
  });
});

describe("héritage toléré seulement dans http, infrastructure, composition", () => {
  it("toléré", () => {
    expect(v("src/backend/equipes/http/x.ts", ["@/lib/auth"])).toEqual([]);
    expect(v("src/backend/equipes/infrastructure/mongoose/x.ts", ["@/models/Equipe"])).toEqual([]);
  });
  it("refusé dans domain, application, index", () => {
    expect(v("src/backend/equipes/domain/x.ts", ["@/types/x"]).length).toBe(1);
    expect(v("src/backend/equipes/application/x.ts", ["@/hooks/x"]).length).toBe(1);
    expect(v("src/backend/equipes/index.ts", ["@/components/x"]).length).toBe(1);
  });
  it("expose la liste transitoire", () => {
    expect(AJOUT_HERITAGE.retraitPrevu).toBe("R9");
    expect(DOSSIERS_HERITES).toContain("src/lib/");
  });
});

describe("R1 — durcissements", () => {
  const domaine = "src/backend/equipes/domain/equipe.ts";
  const application = "src/backend/equipes/application/cas-d-usage.ts";
  it.each(["mongodb", "mongodb/lib/x", "bson"])("interdit %s dans domain et application", (paquet) => {
    expect(v(domaine, [paquet]).length).toBe(1);
    expect(v(application, [paquet]).length).toBe(1);
  });
  it("interdit au frontend d'importer src/app", () => {
    expect(v("src/frontend/equipes/pages/PageEquipes.tsx", ["@/app/api/equipes/route"]).length).toBe(1);
    expect(v("src/frontend/design-system/x.tsx", ["@/app/layout"]).length).toBe(1);
  });
  it("interdit src/app aussi en chemin relatif et dans une fonctionnalité non migrée", () => {
    const r = v("src/frontend/equipes/pages/PageEquipes.tsx", ["../../../app/layout"]);
    expect(r.length).toBe(1);
    expect(r[0]).toContain("R4");
    expect(v("src/frontend/vehicules/x.tsx", ["@/app/layout"]).length).toBe(1);
  });
  it("n'interdit plus src/types comme dossier hérité (il n'existe plus)", () => {
    expect(DOSSIERS_HERITES).not.toContain("src/types/");
  });
});
