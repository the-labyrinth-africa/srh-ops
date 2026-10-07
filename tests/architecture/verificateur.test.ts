// tests/architecture/verificateur.test.ts
import { describe, it, expect } from "vitest";
import { verifierImports, DOSSIERS_OBSOLETES, EXCEPTIONS_INDEX_HTTP } from "./verificateur";

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
  it("accepte son domain, application, infrastructure, shared, platform et les paquets", () => {
    expect(
      v(f, [
        "./domain/equipe",
        "./application/cas-d-usage",
        "./infrastructure/mongoose/equipe.model",
        "@/shared/acces/roles",
        "@/backend/platform/base-de-donnees/connexion",
        "mongoose",
      ])
    ).toEqual([]);
  });
  it("refuse tous les dossiers hérités", () => {
    expect(v(f, ["@/models/User", "@/lib/auth"]).length).toBe(2);
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
  it("accepte platform et shared mais refuse le code hérité", () => {
    expect(v("src/backend/platform/http/x.ts", ["../base-de-donnees/connexion", "@/shared/acces/roles"])).toEqual([]);
    expect(v("src/backend/platform/http/x.ts", ["@/lib/x"]).length).toBe(1);
  });
  it("exception documentée : enregistrement-modeles.ts", () => {
    const f = "src/backend/platform/base-de-donnees/enregistrement-modeles.ts";
    expect(v(f, ["@/backend/equipes/infrastructure/mongoose/equipe.model", "@/backend/clients-sites/infrastructure/mongoose/client.model"])).toEqual([]);
    expect(v("src/backend/platform/base-de-donnees/connexion.ts", ["@/backend/equipes/infrastructure/mongoose/equipe.model"]).length).toBe(1);
  });
});

describe("frontend : technologies et héritage", () => {
  it("refuse mongoose et les modèles hérités, même dans une fonctionnalité migrée", () => {
    expect(v("src/frontend/equipes/pages/P.tsx", ["mongoose"]).length).toBe(1);
    expect(v("src/frontend/equipes/pages/P.tsx", ["@/models/User"]).length).toBe(1);
    expect(v("src/frontend/design-system/x.tsx", ["mongoose"]).length).toBe(1);
  });
  it("refuse tous les dossiers hérités", () => {
    expect(v("src/frontend/equipes/pages/P.tsx", ["@/components/ui/x", "@/hooks/useX", "@/lib/utils"]).length).toBe(3);
  });
});

describe("dossiers hérités supprimés", () => {
  it("refuse les imports legacy dans toutes les couches", () => {
    const imports = ["@/lib/x", "@/models/x", "@/components/x", "@/hooks/x"];
    for (const fichier of [
      "src/backend/equipes/http/x.ts",
      "src/backend/equipes/infrastructure/mongoose/x.ts",
      "src/backend/equipes/composition.ts",
      "src/frontend/equipes/pages/P.tsx",
    ]) {
      expect(v(fichier, imports)).toHaveLength(imports.length);
    }
  });
  it("répertorie uniquement les dossiers hérités réellement supprimés", () => {
    expect(DOSSIERS_OBSOLETES).toEqual(["src/lib/", "src/models/", "src/components/", "src/hooks/"]);
    expect(DOSSIERS_OBSOLETES).not.toContain("src/types/");
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
});

describe("R6 — composition de src/app", () => {
  it("accepte les pages, les domaines publics, shared et les imports Next", () => {
    expect(
      v("src/app/(dashboard)/page.tsx", [
        "@/frontend/pilotage",
        "@/backend/comptes",
        "@/backend/pilotage/index",
        "@/shared/operations/statut-effectif",
        "next/image",
        "next-auth/react",
      ])
    ).toEqual([]);
  });
  it("accepte les contrôleurs uniquement dans les routes API", () => {
    expect(v("src/app/api/operations/route.ts", ["@/backend/operations/http/liste.controleur"])).toEqual([]);
    expect(v("src/app/(dashboard)/page.tsx", ["@/backend/operations/http/liste.controleur"]).length).toBe(1);
  });
  it("autorise uniquement l'option NextAuth de la route NextAuth", () => {
    expect(
      v("src/app/api/auth/[...nextauth]/route.ts", ["@/backend/comptes/infrastructure/next-auth/options"])
    ).toEqual([]);
    expect(v("src/app/api/users/route.ts", ["@/backend/comptes/infrastructure/next-auth/options"]).length).toBe(1);
  });
  it("refuse les détails internes des domaines et les dossiers hérités", () => {
    expect(
      v("src/app/(dashboard)/page.tsx", ["@/backend/pilotage/application/x", "@/backend/pilotage/infrastructure/x", "@/lib/x"])
    ).toHaveLength(3);
  });
  it("refuse les dépendances techniques du backend dans la composition Next", () => {
    expect(v("src/app/api/operations/route.ts", ["mongoose", "jspdf-autotable"])).toHaveLength(2);
  });
});

// Contexte dédié : `comptes` doit être un domaine migré pour que la branche `domaineMigre && couche`
// s'applique (sinon le bloc entier est court-circuité et le test passerait à vide, sans jamais
// exercer l'exception — cf. revue de la tâche 2 du sous-plan R3c).
describe("exception documentée : comptes/index.ts re-exporte ./http/acteur", () => {
  const ctxComptes = { domainesBackendMigres: ["equipes", "comptes"], fonctionnalitesFrontendMigrees: [] };
  const vc = (f: string, i: string[]) => verifierImports(f, i, ctxComptes);

  it("autorisée : exactement comptes/index.ts vers exactement ./http/acteur", () => {
    expect(vc("src/backend/comptes/index.ts", ["./http/acteur"])).toEqual([]);
  });
  it("refusée : un autre fichier de http/, même dans comptes", () => {
    expect(vc("src/backend/comptes/index.ts", ["./http/utilisateurs.liste.controleur"]).length).toBe(1);
  });
  it("refusée : un import de dossier plutôt que du fichier exact", () => {
    expect(vc("src/backend/comptes/index.ts", ["./http"]).length).toBe(1);
  });
  it("refusée : composition.ts reste symétriquement bloqué (l'exception ne vaut que pour index.ts)", () => {
    expect(vc("src/backend/comptes/composition.ts", ["./http/acteur"]).length).toBe(1);
  });
  it("refusée : aucun autre domaine n'est exempté", () => {
    expect(vc("src/backend/equipes/index.ts", ["./http/acteur"]).length).toBe(1);
  });
});

// Tâche 3 (R3c) : deuxième paire de l'allowlist EXCEPTIONS_INDEX_HTTP, même rigueur que la paire
// `acteur` ci-dessus — chaque cas positif est accompagné de son contre-cas négatif symétrique.
describe("exception documentée : comptes/index.ts re-exporte ./http/garde-pages", () => {
  const ctxComptes = { domainesBackendMigres: ["equipes", "comptes"], fonctionnalitesFrontendMigrees: [] };
  const vc = (f: string, i: string[]) => verifierImports(f, i, ctxComptes);

  it("autorisée : exactement comptes/index.ts vers exactement ./http/garde-pages", () => {
    expect(vc("src/backend/comptes/index.ts", ["./http/garde-pages"])).toEqual([]);
  });
  it("refusée : une cible différente depuis le même fichier source (comptes/index.ts)", () => {
    expect(vc("src/backend/comptes/index.ts", ["./http/utilisateurs.liste.controleur"]).length).toBe(1);
  });
  it("refusée : un import de dossier plutôt que du fichier exact", () => {
    expect(vc("src/backend/comptes/index.ts", ["./http"]).length).toBe(1);
  });
  it("refusée : composition.ts reste symétriquement bloqué (l'exception ne vaut que pour index.ts)", () => {
    expect(vc("src/backend/comptes/composition.ts", ["./http/garde-pages"]).length).toBe(1);
  });
  it("refusée : aucun autre domaine n'est exempté (même cible, index.ts d'un autre domaine)", () => {
    expect(vc("src/backend/equipes/index.ts", ["./http/garde-pages"]).length).toBe(1);
  });
});

// Garde-fou : `EXCEPTIONS_INDEX_HTTP` n'a jamais contenu que ces deux paires exactes (`acteur`,
// `garde-pages`), toutes deux vers `comptes/index.ts`. Si l'implémentation est un jour restructurée
// en deux ensembles séparés (fichiers autorisés × cibles autorisées) plutôt qu'en paires exactes,
// ce test échoue dès qu'une troisième entrée élargit silencieusement les deux ensembles — alors
// qu'aucun des tests ci-dessus, qui n'ont jamais vu qu'un appariement 1:1 fichier↔cible, ne le
// détecterait (les deux formes produisent aujourd'hui des résultats identiques).
describe("allowlist EXCEPTIONS_INDEX_HTTP : taille épinglée", () => {
  it("contient exactement les deux paires documentées, ni plus ni moins", () => {
    expect(EXCEPTIONS_INDEX_HTTP).toEqual([
      { fichier: "src/backend/comptes/index.ts", cible: "src/backend/comptes/http/acteur" },
      { fichier: "src/backend/comptes/index.ts", cible: "src/backend/comptes/http/garde-pages" },
    ]);
  });
});
