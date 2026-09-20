# Refactoring R0 — Fondations et domaine pilote `equipes` : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser les fondations de la nouvelle architecture (`src/`, `shared/`, `platform/`, test d'architecture) puis migrer de bout en bout le domaine pilote `equipes` (backend hexagonal + frontend « screaming »), sans aucun changement de comportement.

**Architecture:** Tout le code passe sous `src/`. Le backend d'un domaine est découpé en `domain/` (types, règles, ports), `application/` (cas d'usage), `infrastructure/` (Mongoose, faux en mémoire), `http/` (contrôleurs) et `composition.ts` ; les fichiers `route.ts` ne ré-exportent que les contrôleurs. Le frontend d'une fonctionnalité vit dans `src/frontend/<fonctionnalité>/`, avec un `design-system` partagé. Un test Vitest vérifie les règles de dépendance.

**Tech Stack:** Next.js 16 (App Router, `src/`), TypeScript, Mongoose, Zod, Vitest + mongodb-memory-server, ESLint 9 (flat config).

**Spec:** `docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md` ; feuille de route : `2026-09-20-refactor-architecture-master.md` (contraintes globales, recette, commande `verifier-build`).

## Global Constraints

- **Aucun changement de comportement** : mêmes codes HTTP, mêmes corps JSON (dont `_id`, `createdAt`, `updatedAt`, `__v`), mêmes messages. Les tests existants ne changent que par leurs chemins d'import (et 2 chemins de fichiers lus).
- À chaque commit : `npx tsc --noEmit` propre, `npm run lint` (0 erreur ; 9 avertissements connus), `npx vitest run` tout vert (456 tests au départ).
- Ne jamais lire ni afficher `.env.local` ; ne jamais lancer `npm run build`, `npm run seed`, `scripts/seed-admin.ts`, `scripts/send-test-mail.ts` ; aucun e-mail réel. Vérification de compilation : uniquement la commande `verifier-build` du plan maître.
- Ne jamais stager `.agents/`, `.claude/`, `skills-lock.json`, `rapports/`, `data/`, `.superpowers/`.
- Langue : dossiers de domaine et vocabulaire métier en français ; suffixes techniques en anglais (`Repository`).
- État de départ : `main` (spec `7fe30f4` ou postérieur) ; 456 tests verts ; `tsc` propre ; lint 0 erreur.

### Décisions complémentaires à la spec (rulings du plan)

1. **`__v`** : conservé dans les réponses JSON sous le nom d'entité `revision` (pas de changement de payload).
2. **Tests neufs collés au code** (`*.test.ts` à côté du fichier) ; les tests existants restent dans `tests/` jusqu'à R9.
3. **Registre des modèles Mongoose** : `platform/base-de-donnees/connexion.ts` importe aujourd'hui tous les modèles (enregistrement pour `populate`). Exception documentée à la règle « platform n'importe pas les domaines » : le fichier `enregistrement-modeles.ts` de ce dossier est le **seul** module de `platform` autorisé à importer des `infrastructure/mongoose/*.model.ts`.
4. **`equipes` n'a pas de règle de périmètre** : ses cas d'usage ne prennent pas d'`Acteur`. L'authentification et l'autorisation grossière par rôle restent dans le contrôleur via le garde existant `requireInternalAuth` (hérité de `src/lib/api-auth.ts`, qui migrera avec `comptes` en R3).
5. **Transition** : tant qu'un domaine n'est pas migré, ses fichiers restent dans les dossiers hérités `src/lib`, `src/models`, `src/components`, `src/hooks`, `src/types` ; le test d'architecture n'applique les règles strictes qu'aux modules migrés.

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `scripts/dev/remplacer-imports.mjs` (créer) | Remplace un spécificateur d'import exact dans `src/`, `tests/`, `scripts/` |
| `scripts/dev/redistribuer-imports.mjs` (créer) | Répartit les symboles d'un module éclaté vers leurs nouveaux modules |
| `src/shared/acces/{roles,permissions,acces-pages,acteur}.ts` (créer/déplacer) | Rôles, permissions, matrice d'accès aux pages, type `Acteur` |
| `src/shared/operations/{statuts,quantites}.ts`, `src/shared/comptes/utilisateur.ts`, `src/shared/recurrences/frequence.ts` (créer) | Types issus de l'ancien `types/index.ts` |
| `src/backend/platform/base-de-donnees/{connexion,enregistrement-modeles}.ts` (déplacer/créer) | Connexion Mongoose ; registre des modèles |
| `src/backend/platform/http/identifiants.ts` (déplacer) | `isValidObjectId`, `guardObjectId` |
| `tests/architecture/{verificateur,verificateur.test,regles-de-dependance.test}.ts` (créer) | Vérification des règles R1 à R5 |
| `src/backend/equipes/**` (créer) | Domaine `equipes` hexagonal |
| `src/frontend/design-system/**`, `src/frontend/equipes/**` (créer) | Composants génériques ; fonctionnalité `equipes` |

---

### Task 1: Passage à `src/` et outils de codemod

**Files:**
- Move: `app/`, `middleware.ts`, `lib/`, `models/`, `components/`, `hooks/`, `types/` → sous `src/`
- Modify: `tsconfig.json`, `scripts/seed-admin.ts`, `scripts/send-test-mail.ts`, `scripts/generate-progress-report.ts` (si concerné), `tests/unit/page-guards.test.ts`, `tests/unit/middleware-matcher.test.ts`
- Create: `scripts/dev/remplacer-imports.mjs`, `scripts/dev/redistribuer-imports.mjs`

**Interfaces:**
- Produces : alias `@/*` → `./src/*` ; les imports existants `@/lib/…`, `@/models/…`, `@/components/…`, `@/hooks/…`, `@/types`, `@/app/…` restent valides tels quels (les dossiers ont simplement changé de parent).
- Produces : `node scripts/dev/remplacer-imports.mjs <de> <vers>` ; `node scripts/dev/redistribuer-imports.mjs <carte.json>`.

- [ ] **Step 1: Mesurer la base de départ**

Run: `git switch -c refactor/r0-fondations-et-pilote-equipes && npx vitest run 2>&1 | grep -E "Test Files|Tests " && npx tsc --noEmit && echo "tsc ok" && npm run lint 2>&1 | tail -1`
Expected: `Tests  456 passed`, `tsc ok`, `0 errors, 9 warnings`.

Puis la compilation de référence (variables factices, sans base ni e-mail) :

Run: `MONGODB_URI="mongodb://127.0.0.1:9/inexistant" NEXTAUTH_SECRET="verification-build" NEXTAUTH_URL="http://localhost:3000" NEXT_TELEMETRY_DISABLED=1 npx next build 2>&1 | tail -25`
Expected: le build réussit et liste les routes. **S'il échoue sur `main` avant tout changement, s'arrêter et rapporter la cause exacte** (la suite du plan s'appuie sur ce contrôle).

- [ ] **Step 2: Écrire les deux outils de codemod**

```js
// scripts/dev/remplacer-imports.mjs
// Usage : node scripts/dev/remplacer-imports.mjs "@/lib/db" "@/backend/platform/base-de-donnees/connexion"
// Remplace le spécificateur exact (entre guillemets simples ou doubles) dans src/, tests/ et scripts/.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const [, , de, vers] = process.argv;
if (!de || !vers) {
  console.error('Usage : node scripts/dev/remplacer-imports.mjs "<de>" "<vers>"');
  process.exit(2);
}

const RACINES = ["src", "tests", "scripts"];
const EXTENSIONS = new Set([".ts", ".tsx", ".mjs"]);

function fichiers(dossier) {
  const resultat = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = path.join(dossier, nom);
    if (statSync(chemin).isDirectory()) resultat.push(...fichiers(chemin));
    else if (EXTENSIONS.has(path.extname(nom))) resultat.push(chemin);
  }
  return resultat;
}

let modifies = 0;
for (const racine of RACINES) {
  try {
    statSync(racine);
  } catch {
    continue;
  }
  for (const fichier of fichiers(racine)) {
    const source = readFileSync(fichier, "utf8");
    const nouveau = source.split(`"${de}"`).join(`"${vers}"`).split(`'${de}'`).join(`'${vers}'`);
    if (nouveau !== source) {
      writeFileSync(fichier, nouveau);
      modifies += 1;
      console.log(`modifié : ${fichier}`);
    }
  }
}
console.log(`${modifies} fichier(s) modifié(s).`);
```

```js
// scripts/dev/redistribuer-imports.mjs
// Usage : node scripts/dev/redistribuer-imports.mjs carte.json
// carte.json = { "de": "@/types", "carte": { "UserRole": "@/shared/acces/roles", ... } }
// Réécrit chaque `import { A, B } from "<de>"` en imports groupés par nouveau module.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const [, , cheminCarte] = process.argv;
if (!cheminCarte) {
  console.error("Usage : node scripts/dev/redistribuer-imports.mjs carte.json");
  process.exit(2);
}
const { de, carte } = JSON.parse(readFileSync(cheminCarte, "utf8"));

const RACINES = ["src", "tests", "scripts"];
const EXTENSIONS = new Set([".ts", ".tsx", ".mjs"]);

function fichiers(dossier) {
  const resultat = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = path.join(dossier, nom);
    if (statSync(chemin).isDirectory()) resultat.push(...fichiers(chemin));
    else if (EXTENSIONS.has(path.extname(nom))) resultat.push(chemin);
  }
  return resultat;
}

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MOTIF = new RegExp(
  `import\\s+(type\\s+)?\\{([^}]*)\\}\\s+from\\s+["']${echapper(de)}["'];?`,
  "g"
);

let modifies = 0;
const erreurs = [];
for (const racine of RACINES) {
  try {
    statSync(racine);
  } catch {
    continue;
  }
  for (const fichier of fichiers(racine)) {
    const source = readFileSync(fichier, "utf8");
    const nouveau = source.replace(MOTIF, (_tout, typeSeul, liste) => {
      const groupes = new Map();
      for (const brut of liste.split(",").map((s) => s.trim()).filter(Boolean)) {
        const typeInline = brut.startsWith("type ");
        const sansType = typeInline ? brut.slice(5).trim() : brut;
        const nomSource = sansType.split(/\s+as\s+/)[0].trim();
        const cible = carte[nomSource];
        if (!cible) {
          erreurs.push(`${fichier} : symbole inconnu « ${nomSource} » importé depuis ${de}`);
          return _tout;
        }
        if (!groupes.has(cible)) groupes.set(cible, []);
        groupes.get(cible).push(typeInline ? `type ${sansType}` : sansType);
      }
      return [...groupes.entries()]
        .map(([module, noms]) =>
          typeSeul
            ? `import type { ${noms.join(", ")} } from "${module}";`
            : `import { ${noms.join(", ")} } from "${module}";`
        )
        .join("\n");
    });
    if (nouveau !== source) {
      writeFileSync(fichier, nouveau);
      modifies += 1;
      console.log(`modifié : ${fichier}`);
    }
  }
}
if (erreurs.length > 0) {
  console.error(erreurs.join("\n"));
  process.exit(1);
}
console.log(`${modifies} fichier(s) modifié(s).`);
```

- [ ] **Step 3: Déplacer les dossiers et régler l'alias**

```bash
mkdir src
git mv app src/app
git mv middleware.ts src/middleware.ts
git mv lib src/lib
git mv models src/models
git mv components src/components
git mv hooks src/hooks
git mv types src/types
```

Dans `tsconfig.json`, remplacer le bloc `paths` par :

```json
    "paths": {
      "@/*": [
        "./src/*"
      ]
    }
```

(le `include` `**/*.ts`, `**/*.tsx` reste valable).

- [ ] **Step 4: Corriger les chemins qui ne passent pas par l'alias**

Scripts (imports relatifs) :

```bash
sed -i '' 's#"\.\./lib/#"../src/lib/#g; s#"\.\./models/#"../src/models/#g' scripts/seed-admin.ts scripts/send-test-mail.ts
grep -n '"\.\./' scripts/*.ts scripts/**/*.ts 2>/dev/null
```
Expected : plus aucun `"../lib/` ni `"../models/` ; si `scripts/generate-progress-report.ts` importe autre chose de l'ancienne racine, corriger de même.

Tests qui lisent des chemins :
- `tests/unit/page-guards.test.ts` : `const ROOT = path.join(process.cwd(), "src", "app", "(dashboard)");`
- `tests/unit/middleware-matcher.test.ts` : `import { config } from "../../src/middleware";`

Rechercher les autres mentions de chemins racine : `grep -rn "\"app/\|'app/\|\./app\|\.\./app" --include=*.ts --include=*.tsx --include=*.mjs --include=*.json --include=*.yml . 2>/dev/null | grep -v node_modules | grep -v "^./.next"` et corriger celles qui désignent l'ancien `app/`.

- [ ] **Step 5: Vérifier** (les imports par alias n'ont pas changé)

Run: `npx tsc --noEmit && echo "tsc ok" && npm run lint 2>&1 | tail -1 && npx vitest run 2>&1 | grep -E "Test Files|Tests "`
Expected : `tsc ok`, `0 errors`, `Tests  456 passed`.

Puis : `MONGODB_URI="mongodb://127.0.0.1:9/inexistant" NEXTAUTH_SECRET="verification-build" NEXTAUTH_URL="http://localhost:3000" NEXT_TELEMETRY_DISABLED=1 npx next build 2>&1 | tail -25`
Expected : succès, mêmes routes qu'à l'étape 1 (Next détecte `src/app` et `src/middleware.ts`). S'il ne trouve pas le middleware ou les pages, corriger avant de continuer.

- [ ] **Step 6: Commit**

```bash
git add -A -- ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!data' ':!.superpowers'
git status --short | grep -v "^R\|^M\|^A" | head
git commit -m "refactor: passage à src/ (app, middleware, lib, models, components, hooks, types) et outils de codemod"
```

(Vérifier avant le commit que `git status` ne montre que des renommages `R`, les modifications listées et les deux nouveaux scripts.)

---

### Task 2: Module `shared` (accès, statuts, types métier)

**Files:**
- Create: `src/shared/acces/roles.ts`, `src/shared/acces/acteur.ts`, `src/shared/operations/statuts.ts`, `src/shared/operations/quantites.ts`, `src/shared/comptes/utilisateur.ts`, `src/shared/recurrences/frequence.ts`
- Move: `src/lib/permissions.ts` → `src/shared/acces/permissions.ts` ; `src/lib/page-access.ts` → `src/shared/acces/acces-pages.ts`
- Delete: `src/types/index.ts` (vidé)
- Modify: tous les importeurs (codemod)
- Test: `tests/unit/permissions.test.ts`, `tests/unit/page-access.test.ts` (chemins d'import seulement)

**Interfaces:**
- Produces : `@/shared/acces/roles` → `UserRole`, `USER_ROLES` ; `@/shared/acces/permissions` (contenu de l'ancien `lib/permissions`) ; `@/shared/acces/acces-pages` (`canAccessPath`, `homePathFor`) ; `@/shared/acces/acteur` → `Acteur` ; `@/shared/operations/statuts` → `OperationStatus`, `OPERATION_STATUSES`, `TERMINAL_STATUSES`, `StatusHistoryEntry` ; `@/shared/operations/quantites` → `QuantiteUnite`, `QUANTITE_UNITES` ; `@/shared/comptes/utilisateur` → `IUser` ; `@/shared/recurrences/frequence` → `RecurrenceFrequency` (et tout autre symbole encore exporté par `src/types/index.ts` : lire le fichier en entier et classer chaque symbole).

- [ ] **Step 1: Inventaire.** Lire `src/types/index.ts` en entier et lister **tous** les symboles exportés (au moins : `UserRole`, `USER_ROLES`, `QuantiteUnite`, `QUANTITE_UNITES`, `IUser`, `OperationStatus`, `OPERATION_STATUSES`, `TERMINAL_STATUSES`, `StatusHistoryEntry`, `RecurrenceFrequency`). Tout symbole non listé ici est classé dans le module thématique le plus proche et ajouté à la carte.

- [ ] **Step 2: Créer les nouveaux modules** en **copiant à l'identique** les déclarations du fichier d'origine :
  - `src/shared/acces/roles.ts` : `UserRole`, `USER_ROLES`.
  - `src/shared/operations/statuts.ts` : `OperationStatus`, `OPERATION_STATUSES`, `TERMINAL_STATUSES`, `StatusHistoryEntry` (qui importe `OperationStatus` du même fichier).
  - `src/shared/operations/quantites.ts` : `QuantiteUnite`, `QUANTITE_UNITES`.
  - `src/shared/comptes/utilisateur.ts` : `IUser` (importe `UserRole` depuis `@/shared/acces/roles`).
  - `src/shared/recurrences/frequence.ts` : `RecurrenceFrequency`.
  - `src/shared/acces/acteur.ts` (nouveau, utilisé à partir de R3/R4) :

```ts
import type { UserRole } from "@/shared/acces/roles";

/** Identité de l'appelant, telle que la voient les cas d'usage. */
export interface Acteur {
  id: string;
  role: UserRole;
  clientId?: string;
  equipeId?: string;
}
```

- [ ] **Step 3: Déplacer les deux modules d'accès**

```bash
git mv src/lib/permissions.ts src/shared/acces/permissions.ts
git mv src/lib/page-access.ts src/shared/acces/acces-pages.ts
```
Dans ces deux fichiers, remplacer `import … from "@/types"` par les nouveaux modules (`@/shared/acces/roles` pour `UserRole`/`USER_ROLES`).

- [ ] **Step 4: Redistribuer les imports de `@/types`.** Créer `carte-types.json` (fichier temporaire, non commité) :

```json
{
  "de": "@/types",
  "carte": {
    "UserRole": "@/shared/acces/roles",
    "USER_ROLES": "@/shared/acces/roles",
    "QuantiteUnite": "@/shared/operations/quantites",
    "QUANTITE_UNITES": "@/shared/operations/quantites",
    "IUser": "@/shared/comptes/utilisateur",
    "OperationStatus": "@/shared/operations/statuts",
    "OPERATION_STATUSES": "@/shared/operations/statuts",
    "TERMINAL_STATUSES": "@/shared/operations/statuts",
    "StatusHistoryEntry": "@/shared/operations/statuts",
    "RecurrenceFrequency": "@/shared/recurrences/frequence"
  }
}
```
(compléter avec les symboles trouvés à l'étape 1), puis :

```bash
node scripts/dev/redistribuer-imports.mjs carte-types.json
node scripts/dev/remplacer-imports.mjs "@/lib/permissions" "@/shared/acces/permissions"
node scripts/dev/remplacer-imports.mjs "@/lib/page-access" "@/shared/acces/acces-pages"
git rm -f src/types/index.ts
rm carte-types.json
grep -rn "@/types\|@/lib/permissions\|@/lib/page-access" src tests scripts | head
```
Expected : la redistribution n'affiche aucune erreur de symbole inconnu ; le dernier `grep` ne renvoie rien. Si un import `@/types` d'une forme non gérée subsiste (import par défaut, `export … from`), le corriger à la main.

- [ ] **Step 5: Vérifier**

Run: `npx tsc --noEmit && echo "tsc ok" && npm run lint 2>&1 | tail -1 && npx vitest run 2>&1 | grep -E "Test Files|Tests "`
Expected : tout vert, 456 tests.

- [ ] **Step 6: Commit**

```bash
git add -A -- ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!data' ':!.superpowers'
git commit -m "refactor(shared): rôles, permissions, matrice d'accès, statuts et types métier dans src/shared"
```

---

### Task 3: Socle `platform`, test d'architecture et règles ESLint

**Files:**
- Move: `src/lib/db.ts` → `src/backend/platform/base-de-donnees/connexion.ts` ; `src/lib/mongo-id.ts` → `src/backend/platform/http/identifiants.ts`
- Create: `src/backend/platform/base-de-donnees/enregistrement-modeles.ts`, `tests/architecture/verificateur.ts`, `tests/architecture/verificateur.test.ts`, `tests/architecture/regles-de-dependance.test.ts`
- Modify: `eslint.config.mjs`, `src/lib/validators/object-id.ts` (import), importeurs (codemod)

**Interfaces:**
- Produces : `connectDB` depuis `@/backend/platform/base-de-donnees/connexion` ; `isValidObjectId`, `guardObjectId`, `ObjectIdGuard` depuis `@/backend/platform/http/identifiants`.
- Produces (test) : `verifierImports(fichier: string, imports: string[], contexte: Contexte): string[]` (liste de violations) et `Contexte { domainesBackendMigres: string[]; fonctionnalitesFrontendMigrees: string[] }`.

- [ ] **Step 1: Déplacer et rebrancher**

```bash
mkdir -p src/backend/platform/base-de-donnees src/backend/platform/http
git mv src/lib/db.ts src/backend/platform/base-de-donnees/connexion.ts
git mv src/lib/mongo-id.ts src/backend/platform/http/identifiants.ts
node scripts/dev/remplacer-imports.mjs "@/lib/db" "@/backend/platform/base-de-donnees/connexion"
node scripts/dev/remplacer-imports.mjs "@/lib/mongo-id" "@/backend/platform/http/identifiants"
sed -i '' 's#"\.\./src/lib/db"#"../src/backend/platform/base-de-donnees/connexion"#' scripts/seed-admin.ts
grep -rn "lib/db\|lib/mongo-id" src tests scripts | head
```
Expected : plus aucune référence.

- [ ] **Step 2: Isoler le registre des modèles.** Dans `connexion.ts`, retirer les 8 lignes `import "@/models/…";` du haut du fichier et les remplacer par une seule ligne `import "@/backend/platform/base-de-donnees/enregistrement-modeles";`. Créer `enregistrement-modeles.ts` :

```ts
// Enregistrement des modèles Mongoose : nécessaire pour que `populate` retrouve
// chaque collection. Unique module de `platform` autorisé à importer les modèles
// des domaines (voir la décision n°3 du plan R0). Chaque domaine migré remplace
// ici son ancienne ligne par l'import de son propre `infrastructure/mongoose/*.model`.
import "@/models/Client";
import "@/models/Site";
import "@/models/Equipe";
import "@/models/Vehicule";
import "@/models/Equipement";
import "@/models/User";
import "@/models/Operation";
import "@/models/Recurrence";
```

(recopier exactement les imports qui figuraient dans `connexion.ts`).

- [ ] **Step 3: Écrire le vérificateur d'architecture, test d'abord**

```ts
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
```

Run: `npx vitest run tests/architecture/verificateur.test.ts` → FAIL (module absent).

- [ ] **Step 4: Implémenter le vérificateur**

```ts
// tests/architecture/verificateur.ts
import path from "node:path";

export interface Contexte {
  domainesBackendMigres: string[];
  fonctionnalitesFrontendMigrees: string[];
}

const PAQUETS_INTERDITS_DOMAINE = [
  /^mongoose$/, /^next(\/|$)/, /^next-auth(\/|$)/, /^nodemailer$/, /^bcryptjs$/, /^jspdf(\/|-|$)/, /^exceljs$/,
];
const DOSSIERS_HERITES = ["src/lib/", "src/models/", "src/components/", "src/hooks/", "src/types/"];

/** Transforme un spécificateur d'import en chemin `src/...` (posix) ou en nom de paquet. */
function resoudre(specificateur: string, fichier: string): string {
  if (specificateur.startsWith("@/")) return `src/${specificateur.slice(2)}`;
  if (specificateur.startsWith(".")) {
    return path.posix.normalize(path.posix.join(path.posix.dirname(fichier), specificateur));
  }
  return specificateur;
}

const estPaquet = (cible: string) => !cible.startsWith("src/");

function decouper(fichier: string) {
  const backend = /^src\/backend\/([^/]+)\/(domain|application|infrastructure|http)\//.exec(fichier);
  const frontend = /^src\/frontend\/([^/]+)\//.exec(fichier);
  return {
    domaine: backend?.[1],
    couche: backend?.[2],
    fonctionnalite: frontend?.[1],
    estBackend: fichier.startsWith("src/backend/"),
    estFrontend: fichier.startsWith("src/frontend/"),
  };
}

export function verifierImports(fichier: string, imports: string[], contexte: Contexte): string[] {
  const violations: string[] = [];
  const { domaine, couche, fonctionnalite, estFrontend } = decouper(fichier);
  const signaler = (regle: string, spec: string) => violations.push(`${regle} ${fichier} importe « ${spec} »`);

  for (const spec of imports) {
    const cible = resoudre(spec, fichier);

    // R4 — le frontend n'importe jamais le backend (s'applique à tout src/frontend).
    if (estFrontend && cible.startsWith("src/backend/")) {
      signaler("R4", spec);
      continue;
    }

    // Domaines backend migrés uniquement.
    if (domaine && contexte.domainesBackendMigres.includes(domaine) && couche) {
      const dansDomaine = `src/backend/${domaine}/`;
      const versAutreDomaine = /^src\/backend\/([^/]+)\//.exec(cible);

      if (couche === "domain") {
        const ok = cible.startsWith("src/shared/") || cible.startsWith(`${dansDomaine}domain/`);
        if (!ok) signaler("R1", spec);
        continue;
      }
      if (couche === "application") {
        const ok =
          cible.startsWith("src/shared/") ||
          cible.startsWith(`${dansDomaine}domain/`) ||
          cible.startsWith(`${dansDomaine}application/`) ||
          (estPaquet(cible) && !PAQUETS_INTERDITS_DOMAINE.some((re) => re.test(cible)));
        if (!ok) signaler("R2", spec);
        continue;
      }
      if (couche === "http" && cible.startsWith(`${dansDomaine}infrastructure/`) && !fichier.endsWith("composition.ts")) {
        signaler("R3", spec);
        continue;
      }
      if (couche === "infrastructure" && cible.startsWith(`${dansDomaine}http/`)) {
        signaler("R3", spec);
        continue;
      }
      if (versAutreDomaine && versAutreDomaine[1] !== domaine && versAutreDomaine[1] !== "platform") {
        const autre = versAutreDomaine[1];
        if (cible !== `src/backend/${autre}/index` && cible !== `src/backend/${autre}`) signaler("R5", spec);
      }
    }

    // Fonctionnalités frontend migrées : R5.
    if (fonctionnalite && contexte.fonctionnalitesFrontendMigrees.includes(fonctionnalite)) {
      const versAutre = /^src\/frontend\/([^/]+)\//.exec(cible);
      if (versAutre && versAutre[1] !== fonctionnalite && versAutre[1] !== "design-system") {
        const autre = versAutre[1];
        if (cible !== `src/frontend/${autre}/index`) signaler("R5", spec);
      }
    }
  }
  return violations;
}

export { DOSSIERS_HERITES };
```

Run: `npx vitest run tests/architecture/verificateur.test.ts` → PASS.

- [ ] **Step 5: Test qui lit réellement le dépôt**

```ts
// tests/architecture/regles-de-dependance.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { verifierImports, type Contexte } from "./verificateur";

// À compléter à chaque migration de domaine (recette, étape 8).
const contexte: Contexte = {
  domainesBackendMigres: [],
  fonctionnalitesFrontendMigrees: [],
};

function fichiers(dossier: string): string[] {
  const resultat: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = path.join(dossier, nom);
    if (statSync(chemin).isDirectory()) resultat.push(...fichiers(chemin));
    else if (/\.(ts|tsx)$/.test(nom)) resultat.push(chemin);
  }
  return resultat;
}

function importsDe(source: string): string[] {
  const motifs = [
    /(?:import|export)\s[^"';]*?from\s+["']([^"']+)["']/g,
    /import\s+["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
  ];
  const trouves: string[] = [];
  for (const motif of motifs) for (const m of source.matchAll(motif)) trouves.push(m[1]);
  return trouves;
}

describe("règles de dépendance de l'architecture", () => {
  const racine = process.cwd();
  const sources = ["backend", "frontend", "shared"]
    .map((d) => path.join(racine, "src", d))
    .filter((d) => {
      try {
        return statSync(d).isDirectory();
      } catch {
        return false;
      }
    })
    .flatMap(fichiers);

  it("n'a aucune violation", () => {
    const violations = sources.flatMap((absolu) => {
      const relatif = path.relative(racine, absolu).split(path.sep).join("/");
      // Les tests collés au code peuvent importer ce qu'ils veulent de leur propre module.
      if (/\.test\.(ts|tsx)$/.test(relatif)) return [];
      return verifierImports(relatif, importsDe(readFileSync(absolu, "utf8")), contexte);
    });
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
```

Run: `npx vitest run tests/architecture` → PASS (aucun module migré pour l'instant).

- [ ] **Step 6: Règles ESLint** — ajouter dans `eslint.config.mjs`, dans le tableau `defineConfig` avant `globalIgnores` :

```js
  {
    // Architecture : le frontend ne dépend jamais du backend (règle R4).
    files: ["src/frontend/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/backend/*", "@/backend/**"], message: "Le frontend n'importe jamais le backend (R4) : passer par src/shared." },
          ],
        },
      ],
    },
  },
  {
    // Architecture : domain et application n'importent aucune technologie (règles R1/R2).
    files: ["src/backend/*/domain/**/*.ts", "src/backend/*/application/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["mongoose", "next", "next-auth", "nodemailer", "bcryptjs", "jspdf", "exceljs"].map((name) => ({
            name,
            message: "Le domaine et les cas d'usage ne dépendent d'aucune technologie : passer par un port.",
          })),
          patterns: [
            { group: ["next/*", "next-auth/*", "jspdf-*"], message: "Idem : passer par un port." },
          ],
        },
      ],
    },
  },
```

- [ ] **Step 7: Vérifier**

Run: `npx tsc --noEmit && echo "tsc ok" && npm run lint 2>&1 | tail -1 && npx vitest run 2>&1 | grep -E "Test Files|Tests "`
Expected : tout vert ; 456 tests + les nouveaux tests d'architecture.

- [ ] **Step 8: Commit**

```bash
git add -A -- ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!data' ':!.superpowers'
git commit -m "refactor(platform): connexion base et identifiants dans platform ; test d'architecture et règles ESLint"
```

---

### Task 4: Domaine `equipes` — backend hexagonal

**Files:**
- Create: `src/backend/equipes/domain/{equipe,erreurs,ports}.ts`, `src/backend/equipes/application/cas-d-usage.ts`, `src/backend/equipes/infrastructure/en-memoire/equipe.repository.en-memoire.ts`, `src/backend/equipes/infrastructure/mongoose/{equipe.model,equipe.repository.mongoose,rattachements-utilisateurs.mongoose}.ts`, `src/backend/equipes/http/{equipe.schema,presentation,liste.controleur,detail.controleur}.ts`, `src/backend/equipes/composition.ts`, `src/backend/equipes/index.ts`
- Move: `src/models/Equipe.ts` → `src/backend/equipes/infrastructure/mongoose/equipe.model.ts` ; `src/lib/validators/equipe.ts` → `src/backend/equipes/http/equipe.schema.ts`
- Modify: `src/app/api/equipes/route.ts`, `src/app/api/equipes/[id]/route.ts`, `src/backend/platform/base-de-donnees/enregistrement-modeles.ts`, importeurs de `@/models/Equipe` et `@/lib/validators/equipe`, `scripts/seed-admin.ts`, `tests/architecture/regles-de-dependance.test.ts`
- Test (neufs, collés au code) : `src/backend/equipes/application/cas-d-usage.test.ts`, `src/backend/equipes/infrastructure/mongoose/equipe.repository.mongoose.test.ts`

**Interfaces:**
- Produces : `Equipe`, `EquipeSaisie` ; `EquipeRepository`, `RattachementsUtilisateurs` ; `creerCasDUsageEquipes(deps)` → `{ lister, obtenir, creer, modifier, supprimer }` ; erreurs `EquipeIntrouvable` (message `"Non trouvé"`), `EquipeRattachee` (message `"Cette équipe est rattachée à des comptes utilisateurs"`).
- Consumes : `connectDB`, `guardObjectId` (Task 3) ; `requireInternalAuth` (existant, `@/lib/api-auth`) ; `User` (`@/models/User`, transitoire).

- [ ] **Step 1: Caractérisation.** Vérifier que les comportements suivants sont couverts par des tests existants (`grep -rn "equipes" tests`) : liste triée par nom, création 201 avec `_id`, validation 400 (`nom` vide), lecture par identifiant 200 / 404 / 400 (id invalide), mise à jour 200 / 404, suppression 200 / 404 / 409 (compte rattaché), refus 403 d'un chauffeur et d'un client, 401 sans session. Ajouter dans `tests/integration/equipes-caracterisation.test.ts` les cas manquants (test d'abord sur le code actuel : ils doivent **passer** avant tout déplacement). Modèle de test : voir `tests/integration/referentiels-api.test.ts` (session simulée avec `vi.mock("next-auth")`). Lancer `npx vitest run tests/integration/equipes-caracterisation.test.ts` → PASS. Commit :

```bash
git add tests/integration/equipes-caracterisation.test.ts
git commit -m "test(equipes): tests de caractérisation avant migration"
```

(Si tout est déjà couvert, le noter dans le rapport et passer à l'étape suivante.)

- [ ] **Step 2: Domaine et ports, puis test des cas d'usage (rouge)**

```ts
// src/backend/equipes/domain/equipe.ts
export interface Equipe {
  id: string;
  nom: string;
  membres: string[];
  disponibilite: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Numéro de révision technique conservé pour reproduire la réponse JSON à l'identique (`__v`). */
  revision?: number;
}

export interface EquipeSaisie {
  nom: string;
  membres: string[];
  disponibilite: boolean;
}
```

```ts
// src/backend/equipes/domain/erreurs.ts
export class EquipeIntrouvable extends Error {
  constructor() {
    super("Non trouvé");
    this.name = "EquipeIntrouvable";
  }
}

export class EquipeRattachee extends Error {
  constructor() {
    super("Cette équipe est rattachée à des comptes utilisateurs");
    this.name = "EquipeRattachee";
  }
}
```

```ts
// src/backend/equipes/domain/ports.ts
import type { Equipe, EquipeSaisie } from "./equipe";

export interface EquipeRepository {
  /** Toutes les équipes, triées par nom croissant. */
  lister(): Promise<Equipe[]>;
  trouverParId(id: string): Promise<Equipe | null>;
  creer(saisie: EquipeSaisie): Promise<Equipe>;
  /** null si l'équipe n'existe pas. */
  modifier(id: string, saisie: EquipeSaisie): Promise<Equipe | null>;
  /** false si l'équipe n'existait pas. */
  supprimer(id: string): Promise<boolean>;
}

export interface RattachementsUtilisateurs {
  existePourEquipe(equipeId: string): Promise<boolean>;
}
```

```ts
// src/backend/equipes/infrastructure/en-memoire/equipe.repository.en-memoire.ts
import type { Equipe, EquipeSaisie } from "../../domain/equipe";
import type { EquipeRepository, RattachementsUtilisateurs } from "../../domain/ports";

/** Dépôt en mémoire : sert aux tests des cas d'usage (aucune base nécessaire). */
export class EquipeRepositoryEnMemoire implements EquipeRepository {
  private readonly donnees = new Map<string, Equipe>();
  private compteur = 0;

  async lister(): Promise<Equipe[]> {
    return [...this.donnees.values()].sort((a, b) => a.nom.localeCompare(b.nom));
  }

  async trouverParId(id: string): Promise<Equipe | null> {
    return this.donnees.get(id) ?? null;
  }

  async creer(saisie: EquipeSaisie): Promise<Equipe> {
    this.compteur += 1;
    const maintenant = new Date();
    const equipe: Equipe = { id: `equipe-${this.compteur}`, ...saisie, createdAt: maintenant, updatedAt: maintenant };
    this.donnees.set(equipe.id, equipe);
    return equipe;
  }

  async modifier(id: string, saisie: EquipeSaisie): Promise<Equipe | null> {
    const existante = this.donnees.get(id);
    if (!existante) return null;
    const modifiee: Equipe = { ...existante, ...saisie, updatedAt: new Date() };
    this.donnees.set(id, modifiee);
    return modifiee;
  }

  async supprimer(id: string): Promise<boolean> {
    return this.donnees.delete(id);
  }
}

export class RattachementsUtilisateursEnMemoire implements RattachementsUtilisateurs {
  private readonly equipesRattachees = new Set<string>();

  rattacher(equipeId: string): void {
    this.equipesRattachees.add(equipeId);
  }

  async existePourEquipe(equipeId: string): Promise<boolean> {
    return this.equipesRattachees.has(equipeId);
  }
}
```

```ts
// src/backend/equipes/application/cas-d-usage.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { creerCasDUsageEquipes } from "./cas-d-usage";
import { EquipeIntrouvable, EquipeRattachee } from "../domain/erreurs";
import {
  EquipeRepositoryEnMemoire,
  RattachementsUtilisateursEnMemoire,
} from "../infrastructure/en-memoire/equipe.repository.en-memoire";

let equipes: EquipeRepositoryEnMemoire;
let rattachements: RattachementsUtilisateursEnMemoire;
let cas: ReturnType<typeof creerCasDUsageEquipes>;

const saisie = (nom: string) => ({ nom, membres: [], disponibilite: true });

beforeEach(() => {
  equipes = new EquipeRepositoryEnMemoire();
  rattachements = new RattachementsUtilisateursEnMemoire();
  cas = creerCasDUsageEquipes({ equipes, rattachements });
});

describe("cas d'usage des équipes", () => {
  it("liste les équipes triées par nom", async () => {
    await cas.creer(saisie("Zeta"));
    await cas.creer(saisie("Alpha"));
    expect((await cas.lister()).map((e) => e.nom)).toEqual(["Alpha", "Zeta"]);
  });

  it("crée puis obtient une équipe", async () => {
    const creee = await cas.creer({ nom: "A", membres: ["x", "y"], disponibilite: false });
    expect(await cas.obtenir(creee.id)).toMatchObject({ nom: "A", membres: ["x", "y"], disponibilite: false });
  });

  it("obtenir une équipe inconnue lève EquipeIntrouvable", async () => {
    await expect(cas.obtenir("inconnue")).rejects.toBeInstanceOf(EquipeIntrouvable);
  });

  it("modifie une équipe existante et refuse une équipe inconnue", async () => {
    const creee = await cas.creer(saisie("A"));
    expect((await cas.modifier(creee.id, saisie("B"))).nom).toBe("B");
    await expect(cas.modifier("inconnue", saisie("B"))).rejects.toBeInstanceOf(EquipeIntrouvable);
  });

  it("supprime une équipe libre", async () => {
    const creee = await cas.creer(saisie("A"));
    await cas.supprimer(creee.id);
    await expect(cas.obtenir(creee.id)).rejects.toBeInstanceOf(EquipeIntrouvable);
  });

  it("refuse de supprimer une équipe rattachée à des comptes, qui reste présente", async () => {
    const creee = await cas.creer(saisie("A"));
    rattachements.rattacher(creee.id);
    await expect(cas.supprimer(creee.id)).rejects.toBeInstanceOf(EquipeRattachee);
    expect(await cas.obtenir(creee.id)).toMatchObject({ nom: "A" });
  });

  it("supprimer une équipe inconnue lève EquipeIntrouvable", async () => {
    await expect(cas.supprimer("inconnue")).rejects.toBeInstanceOf(EquipeIntrouvable);
  });

  it("le rattachement est vérifié AVANT l'existence (même ordre que la route actuelle)", async () => {
    rattachements.rattacher("fantome");
    await expect(cas.supprimer("fantome")).rejects.toBeInstanceOf(EquipeRattachee);
  });
});
```

Run: `npx vitest run src/backend/equipes/application/cas-d-usage.test.ts` → FAIL (module `./cas-d-usage` absent).

- [ ] **Step 3: Cas d'usage (vert)**

```ts
// src/backend/equipes/application/cas-d-usage.ts
import type { Equipe, EquipeSaisie } from "../domain/equipe";
import { EquipeIntrouvable, EquipeRattachee } from "../domain/erreurs";
import type { EquipeRepository, RattachementsUtilisateurs } from "../domain/ports";

export interface DependancesEquipes {
  equipes: EquipeRepository;
  rattachements: RattachementsUtilisateurs;
}

export function creerCasDUsageEquipes({ equipes, rattachements }: DependancesEquipes) {
  return {
    lister(): Promise<Equipe[]> {
      return equipes.lister();
    },

    async obtenir(id: string): Promise<Equipe> {
      const equipe = await equipes.trouverParId(id);
      if (!equipe) throw new EquipeIntrouvable();
      return equipe;
    },

    creer(saisie: EquipeSaisie): Promise<Equipe> {
      return equipes.creer(saisie);
    },

    async modifier(id: string, saisie: EquipeSaisie): Promise<Equipe> {
      const equipe = await equipes.modifier(id, saisie);
      if (!equipe) throw new EquipeIntrouvable();
      return equipe;
    },

    async supprimer(id: string): Promise<void> {
      // Même ordre que la route d'origine : le rattachement est contrôlé avant l'existence.
      if (await rattachements.existePourEquipe(id)) throw new EquipeRattachee();
      const supprimee = await equipes.supprimer(id);
      if (!supprimee) throw new EquipeIntrouvable();
    },
  };
}

export type CasDUsageEquipes = ReturnType<typeof creerCasDUsageEquipes>;
```

Run: `npx vitest run src/backend/equipes/application/cas-d-usage.test.ts` → PASS.

- [ ] **Step 4: Adaptateurs Mongoose et test de contrat**

```bash
mkdir -p src/backend/equipes/infrastructure/mongoose src/backend/equipes/http
git mv src/models/Equipe.ts src/backend/equipes/infrastructure/mongoose/equipe.model.ts
git mv src/lib/validators/equipe.ts src/backend/equipes/http/equipe.schema.ts
node scripts/dev/remplacer-imports.mjs "@/models/Equipe" "@/backend/equipes/infrastructure/mongoose/equipe.model"
node scripts/dev/remplacer-imports.mjs "@/lib/validators/equipe" "@/backend/equipes/http/equipe.schema"
sed -i '' 's#"\.\./src/models/Equipe"#"../src/backend/equipes/infrastructure/mongoose/equipe.model"#' scripts/seed-admin.ts
```
Dans `enregistrement-modeles.ts`, remplacer `import "@/models/Equipe";` par `import "@/backend/equipes/infrastructure/mongoose/equipe.model";`. Le contenu de `equipe.model.ts` ne change pas (schéma identique).

```ts
// src/backend/equipes/infrastructure/mongoose/equipe.repository.mongoose.ts
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type { Equipe, EquipeSaisie } from "../../domain/equipe";
import type { EquipeRepository } from "../../domain/ports";
import { Equipe as EquipeModel } from "./equipe.model";

interface DocumentEquipe {
  _id: unknown;
  nom: string;
  membres?: string[];
  disponibilite: boolean;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

function versEntite(doc: DocumentEquipe): Equipe {
  return {
    id: String(doc._id),
    nom: doc.nom,
    membres: doc.membres ?? [],
    disponibilite: doc.disponibilite,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    revision: doc.__v,
  };
}

export class EquipeRepositoryMongoose implements EquipeRepository {
  async lister(): Promise<Equipe[]> {
    await connectDB();
    const docs = (await EquipeModel.find().sort({ nom: 1 }).lean()) as DocumentEquipe[];
    return docs.map(versEntite);
  }

  async trouverParId(id: string): Promise<Equipe | null> {
    await connectDB();
    const doc = (await EquipeModel.findById(id).lean()) as DocumentEquipe | null;
    return doc ? versEntite(doc) : null;
  }

  async creer(saisie: EquipeSaisie): Promise<Equipe> {
    await connectDB();
    const doc = await EquipeModel.create(saisie);
    return versEntite(doc.toObject() as DocumentEquipe);
  }

  async modifier(id: string, saisie: EquipeSaisie): Promise<Equipe | null> {
    await connectDB();
    const doc = (await EquipeModel.findByIdAndUpdate(id, saisie, { new: true }).lean()) as DocumentEquipe | null;
    return doc ? versEntite(doc) : null;
  }

  async supprimer(id: string): Promise<boolean> {
    await connectDB();
    const doc = await EquipeModel.findByIdAndDelete(id);
    return Boolean(doc);
  }
}
```

```ts
// src/backend/equipes/infrastructure/mongoose/rattachements-utilisateurs.mongoose.ts
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type { RattachementsUtilisateurs } from "../../domain/ports";
// Transitoire : le modèle User rejoindra le domaine `comptes` au jalon R3 (l'import
// passera alors par `@/backend/comptes/index`).
import { User } from "@/models/User";

export class RattachementsUtilisateursMongoose implements RattachementsUtilisateurs {
  async existePourEquipe(equipeId: string): Promise<boolean> {
    await connectDB();
    return Boolean(await User.exists({ equipeId }));
  }
}
```

Test de contrat (MongoDB en mémoire fournie par `tests/setup.ts`) :

```ts
// src/backend/equipes/infrastructure/mongoose/equipe.repository.mongoose.test.ts
import { describe, it, expect } from "vitest";
import { EquipeRepositoryMongoose } from "./equipe.repository.mongoose";
import { RattachementsUtilisateursMongoose } from "./rattachements-utilisateurs.mongoose";
import { Equipe as EquipeModel } from "./equipe.model";
import { User } from "@/models/User";

const depot = new EquipeRepositoryMongoose();

describe("EquipeRepositoryMongoose (contrat)", () => {
  it("crée puis relit une équipe avec ses valeurs par défaut et sa révision", async () => {
    const creee = await depot.creer({ nom: "Équipe A", membres: ["Awa"], disponibilite: true });
    expect(creee.id).toMatch(/^[a-f\d]{24}$/);
    expect(creee.revision).toBe(0);
    expect(creee.createdAt).toBeInstanceOf(Date);
    expect(await depot.trouverParId(creee.id)).toMatchObject({ nom: "Équipe A", membres: ["Awa"] });
  });

  it("liste par nom croissant", async () => {
    await depot.creer({ nom: "Zeta", membres: [], disponibilite: true });
    await depot.creer({ nom: "Alpha", membres: [], disponibilite: true });
    expect((await depot.lister()).map((e) => e.nom)).toEqual(["Alpha", "Zeta"]);
  });

  it("modifie et renvoie la version mise à jour ; null pour un identifiant inconnu", async () => {
    const creee = await depot.creer({ nom: "A", membres: [], disponibilite: true });
    const modifiee = await depot.modifier(creee.id, { nom: "B", membres: ["x"], disponibilite: false });
    expect(modifiee).toMatchObject({ nom: "B", membres: ["x"], disponibilite: false });
    expect(await depot.modifier("507f1f77bcf86cd799439099", { nom: "B", membres: [], disponibilite: true })).toBeNull();
  });

  it("supprime et signale l'absence", async () => {
    const creee = await depot.creer({ nom: "A", membres: [], disponibilite: true });
    expect(await depot.supprimer(creee.id)).toBe(true);
    expect(await depot.supprimer(creee.id)).toBe(false);
    expect(await EquipeModel.countDocuments({})).toBe(0);
  });
});

describe("RattachementsUtilisateursMongoose", () => {
  it("détecte un compte rattaché à l'équipe", async () => {
    const equipe = await depot.creer({ nom: "A", membres: [], disponibilite: true });
    const rattachements = new RattachementsUtilisateursMongoose();
    expect(await rattachements.existePourEquipe(equipe.id)).toBe(false);
    await User.create({
      username: "chauf1", nom: "C", email: "c@srh.ci", motDePasseHash: "x", role: "chauffeur", equipeId: equipe.id,
    });
    expect(await rattachements.existePourEquipe(equipe.id)).toBe(true);
  });
});
```

Run: `npx vitest run src/backend/equipes/infrastructure` → PASS.

- [ ] **Step 5: Contrôleurs, composition, index, routes**

```ts
// src/backend/equipes/http/presentation.ts
import type { Equipe } from "../domain/equipe";

/** Forme JSON historique de l'API (document Mongoose sérialisé). */
export function versReponse(equipe: Equipe) {
  return {
    _id: equipe.id,
    nom: equipe.nom,
    membres: equipe.membres,
    disponibilite: equipe.disponibilite,
    createdAt: equipe.createdAt,
    updatedAt: equipe.updatedAt,
    __v: equipe.revision,
  };
}
```

`equipe.schema.ts` (déplacé) garde son contenu ; ajouter `import type { EquipeSaisie } from "../domain/equipe";` **en haut du fichier** (avec l'import de `zod`, pour respecter `import/first`) et la conversion suivante à la suite de `equipeSchema` et du type `EquipeInput` existants :

```ts
export function versSaisie(entree: EquipeInput): EquipeSaisie {
  return { nom: entree.nom, membres: entree.membres, disponibilite: entree.disponibilite };
}
```

```ts
// src/backend/equipes/composition.ts
import { creerCasDUsageEquipes } from "./application/cas-d-usage";
import { EquipeRepositoryMongoose } from "./infrastructure/mongoose/equipe.repository.mongoose";
import { RattachementsUtilisateursMongoose } from "./infrastructure/mongoose/rattachements-utilisateurs.mongoose";

export const casDUsageEquipes = creerCasDUsageEquipes({
  equipes: new EquipeRepositoryMongoose(),
  rattachements: new RattachementsUtilisateursMongoose(),
});
```

```ts
// src/backend/equipes/http/liste.controleur.ts
import { NextRequest, NextResponse } from "next/server";
import { requireInternalAuth } from "@/lib/api-auth"; // transitoire : migre avec `comptes` (R3)
import { casDUsageEquipes } from "../composition";
import { equipeSchema, versSaisie } from "./equipe.schema";
import { versReponse } from "./presentation";

export async function GET() {
  const auth = await requireInternalAuth();
  if (auth.error) return auth.error;

  const equipes = await casDUsageEquipes.lister();
  return NextResponse.json(equipes.map(versReponse));
}

export async function POST(req: NextRequest) {
  const auth = await requireInternalAuth(true);
  if (auth.error) return auth.error;

  const body = await req.json();
  const parsed = equipeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const equipe = await casDUsageEquipes.creer(versSaisie(parsed.data));
  return NextResponse.json(versReponse(equipe), { status: 201 });
}
```

```ts
// src/backend/equipes/http/detail.controleur.ts
import { NextRequest, NextResponse } from "next/server";
import { requireInternalAuth } from "@/lib/api-auth"; // transitoire : migre avec `comptes` (R3)
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { EquipeIntrouvable, EquipeRattachee } from "../domain/erreurs";
import { casDUsageEquipes } from "../composition";
import { equipeSchema, versSaisie } from "./equipe.schema";
import { versReponse } from "./presentation";

type Params = { params: Promise<{ id: string }> };

function reponseErreur(error: unknown) {
  if (error instanceof EquipeIntrouvable) return NextResponse.json({ error: error.message }, { status: 404 });
  if (error instanceof EquipeRattachee) return NextResponse.json({ error: error.message }, { status: 409 });
  throw error;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireInternalAuth();
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  try {
    return NextResponse.json(versReponse(await casDUsageEquipes.obtenir(id)));
  } catch (error) {
    return reponseErreur(error);
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireInternalAuth(true);
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  const body = await req.json();
  const parsed = equipeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    return NextResponse.json(versReponse(await casDUsageEquipes.modifier(id, versSaisie(parsed.data))));
  } catch (error) {
    return reponseErreur(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireInternalAuth(true);
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  try {
    await casDUsageEquipes.supprimer(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return reponseErreur(error);
  }
}
```

```ts
// src/backend/equipes/index.ts
// API publique du domaine `equipes` pour les autres domaines : aujourd'hui aucune
// (les autres domaines ne dépendent pas des équipes). Ajouter ici, le cas échéant,
// des fonctions de lecture exposées explicitement.
export {};
```

```ts
// src/app/api/equipes/route.ts
export { GET, POST } from "@/backend/equipes/http/liste.controleur";
```

```ts
// src/app/api/equipes/[id]/route.ts
export { GET, PUT, DELETE } from "@/backend/equipes/http/detail.controleur";
```

Ordre des vérifications dans DELETE : identique à l'original (auth → garde d'identifiant → rattachement 409 → suppression / 404) ; c'est ce que garantissent le test « rattachement avant existence » et la caractérisation.

- [ ] **Step 6: Déclarer le domaine migré.** Dans `tests/architecture/regles-de-dependance.test.ts` : `domainesBackendMigres: ["equipes"]`. Run : `npx vitest run tests/architecture` → PASS (les règles R1 à R5 s'appliquent maintenant à `src/backend/equipes`). Si une violation apparaît, corriger le code (pas la règle).

- [ ] **Step 7: Vérifier**

Run: `npx tsc --noEmit && echo "tsc ok" && npm run lint 2>&1 | tail -1 && npx vitest run 2>&1 | grep -E "Test Files|Tests "`
Expected : tout vert ; les tests d'intégration existants (`referentiels-api`, `referentiels-delete-guard`, `authz-roles`, `chauffeur-scope`, `users-*`, etc.) passent **sans autre modification que leurs chemins d'import**.

Puis : `MONGODB_URI="mongodb://127.0.0.1:9/inexistant" NEXTAUTH_SECRET="verification-build" NEXTAUTH_URL="http://localhost:3000" NEXT_TELEMETRY_DISABLED=1 npx next build 2>&1 | tail -25`
Expected : succès (Next accepte les ré-exports `export { GET, POST } from …`). Si Next refuse les ré-exports, remplacer dans les deux fichiers de routes par des fonctions qui délèguent (`export const GET = liste.GET;` n'est pas accepté non plus : utiliser `export async function GET() { return liste.GET(); }` avec `import * as liste`) et le consigner.

- [ ] **Step 8: Commit**

```bash
git add -A -- ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!data' ':!.superpowers'
git commit -m "refactor(equipes): domaine hexagonal (domain, cas d'usage, adaptateurs Mongoose, contrôleurs)"
```

---

### Task 5: Fonctionnalité frontend `equipes` et `design-system`

**Files:**
- Move: `src/components/forms/EntityModal.tsx` → `src/frontend/design-system/EntityModal.tsx` ; `src/components/referentials/ReferentialPage.tsx` → `src/frontend/design-system/PageReferentiel.tsx` ; `src/lib/utils.ts` → `src/frontend/design-system/utils.ts`
- Create: `src/frontend/equipes/pages/PageEquipes.tsx`, `src/frontend/equipes/api/chemins.ts`, `src/frontend/equipes/index.ts`
- Modify: `src/app/(dashboard)/equipes/page.tsx`, `src/app/(dashboard)/vehicules/page.tsx`, `src/app/(dashboard)/equipements/page.tsx`, importeurs de `@/lib/utils`, `@/components/forms/EntityModal`, `tests/architecture/regles-de-dependance.test.ts`

**Interfaces:**
- Produces : `PageReferentiel` (même props que l'ancien `ReferentialPage`) ; `PageEquipes()` ; `CHEMIN_API_EQUIPES = "/api/equipes"` ; `cn` depuis `@/frontend/design-system/utils`.

- [ ] **Step 1: Déplacer le design-system**

```bash
mkdir -p src/frontend/design-system
git mv src/components/forms/EntityModal.tsx src/frontend/design-system/EntityModal.tsx
git mv src/components/referentials/ReferentialPage.tsx src/frontend/design-system/PageReferentiel.tsx
git mv src/lib/utils.ts src/frontend/design-system/utils.ts
node scripts/dev/remplacer-imports.mjs "@/lib/utils" "@/frontend/design-system/utils"
node scripts/dev/remplacer-imports.mjs "@/components/forms/EntityModal" "@/frontend/design-system/EntityModal"
node scripts/dev/remplacer-imports.mjs "@/components/referentials/ReferentialPage" "@/frontend/design-system/PageReferentiel"
```
Dans `PageReferentiel.tsx` : renommer `export function ReferentialPage(` en `export function PageReferentiel(` (et le nom de l'interface de props si besoin) ; dans `src/app/(dashboard)/vehicules/page.tsx` et `equipements/page.tsx`, remplacer `ReferentialPage` par `PageReferentiel` (import et JSX). Vérifier : `grep -rn "ReferentialPage" src tests` ne renvoie plus rien ; `rmdir src/components/forms src/components/referentials 2>/dev/null` si vides.

- [ ] **Step 2: La fonctionnalité `equipes`**

```ts
// src/frontend/equipes/api/chemins.ts
export const CHEMIN_API_EQUIPES = "/api/equipes";
```

```tsx
// src/frontend/equipes/pages/PageEquipes.tsx
import { PageReferentiel } from "@/frontend/design-system/PageReferentiel";
import { CHEMIN_API_EQUIPES } from "../api/chemins";

export function PageEquipes() {
  return (
    <PageReferentiel
      title="Équipes & Chauffeurs"
      subtitle="Gestion des équipes terrain et de leur disponibilité."
      icon="groups"
      apiPath={CHEMIN_API_EQUIPES}
      fields={[
        { key: "nom", label: "Nom de l'équipe", required: true },
        { key: "membres", label: "Membres (séparés par virgule)", table: false },
        { key: "disponibilite", label: "Disponibilité", type: "checkbox" },
      ]}
      emptyForm={{ nom: "", membres: "", disponibilite: true }}
    />
  );
}
```

```ts
// src/frontend/equipes/index.ts
export { PageEquipes } from "./pages/PageEquipes";
```

```tsx
// src/app/(dashboard)/equipes/page.tsx
import { PageEquipes } from "@/frontend/equipes";
import { requirePageAccess } from "@/lib/page-auth";

export default async function EquipesPage() {
  await requirePageAccess("/equipes");
  return <PageEquipes />;
}
```

(La page conserve sa garde d'accès : `tests/unit/page-guards.test.ts` reste vert.)

- [ ] **Step 3: Déclarer la fonctionnalité migrée.** Dans `tests/architecture/regles-de-dependance.test.ts` : `fonctionnalitesFrontendMigrees: ["equipes"]`. Run `npx vitest run tests/architecture` → PASS. Vérifier aussi le lint : `npm run lint` (la règle ESLint R4 s'applique à `src/frontend/**`).

- [ ] **Step 4: Vérifier** (aucun changement visuel : le même composant reçoit les mêmes props)

Run: `npx tsc --noEmit && echo "tsc ok" && npm run lint 2>&1 | tail -1 && npx vitest run 2>&1 | grep -E "Test Files|Tests "`
Puis `verifier-build` (commande du plan maître) → succès.

- [ ] **Step 5: Commit**

```bash
git add -A -- ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!data' ':!.superpowers'
git commit -m "refactor(equipes): fonctionnalité frontend equipes et design-system (EntityModal, PageReferentiel, utils)"
```

---

### Task 6: Documentation, vérification finale du jalon et revue

**Files:**
- Modify: `README.md` (nouvelle section « Architecture »), `docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md` (statut), `docs/superpowers/plans/2026-09-20-refactor-architecture-master.md` (statut R0)

- [ ] **Step 1: README.** Ajouter une section « Architecture » (10 à 25 lignes, en français) : les trois arbres `src/backend`, `src/frontend`, `src/shared` ; la structure d'un domaine (`domain/`, `application/`, `infrastructure/`, `http/`, `composition.ts`, `index.ts`) ; les règles R1 à R6 en une phrase chacune ; comment ajouter un cas d'usage (port → cas d'usage + test avec faux en mémoire → adaptateur → contrôleur → route qui ré-exporte) ; la commande `verifier-build` ; la liste des domaines déjà migrés (`equipes`) et de ceux qui restent dans les dossiers hérités (`src/lib`, `src/models`, `src/components`, `src/hooks`) pendant la transition. Ne rien affirmer qui ne soit vérifié dans le code.

- [ ] **Step 2: Statuts.** Spec : ligne « Statut » → « R0 (fondations + pilote equipes) réalisé ; jalons R1 à R9 à venir ». Plan maître : statut de la ligne R0 → « **Réalisé** ».

- [ ] **Step 3: Vérification complète**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected : `tsc` propre ; 0 erreur de lint ; tous les tests verts (456 + tests d'architecture + tests de domaine `equipes`). Puis `verifier-build`.

- [ ] **Step 4: Contrôles de non-régression ciblés** (à consigner dans le rapport) :
  - `git diff main --stat -- tests/integration tests/unit | tail -5` : les tests existants ne changent que par des chemins d'import (aucune assertion modifiée) — lister tout diff de test qui n'est pas un chemin.
  - Comparer la forme JSON des réponses `equipes` avant/après : les tests de caractérisation de l'étape 1 de la tâche 4 doivent contenir une assertion sur les clés (`_id`, `nom`, `membres`, `disponibilite`, `createdAt`, `updatedAt`, `__v`).

- [ ] **Step 5: Commit**

```bash
git add README.md docs/superpowers/specs docs/superpowers/plans
git commit -m "docs: section Architecture du README et statut du jalon R0"
```

- [ ] **Step 6: Revue de branche complète** (skill `superpowers:requesting-code-review`, modèle le plus capable), critères : aucun changement de comportement (codes, corps, messages, ordre des vérifications) sur les 5 routes `equipes` ; règles R1 à R5 réellement vérifiées (le test d'architecture échoue sur une violation injectée à la main puis rétablie) ; codemods sans import oublié ; aucune assertion de test modifiée ; pas de fichier applicatif hors `src/` ; configuration Next/Tailwind/ESLint cohérente avec `src/`.

---

## Auto-relecture

- **Couverture de la spec (jalon R0) :** passage à `src/` (tâche 1) ; `shared` (tâche 2) ; `platform` base + identifiants, test d'architecture, ESLint (tâche 3) ; domaine pilote backend (tâche 4) ; frontend pilote et design-system (tâche 5) ; documentation et revue (tâche 6). Les autres éléments de `platform` (e-mail, limiteur, exécution différée, horloge, URL) sont volontairement reportés à R3 (ils n'ont pas de consommateur avant `comptes`).
- **Cohérence des noms :** `casDUsageEquipes`, `creerCasDUsageEquipes`, `EquipeRepository`, `RattachementsUtilisateurs`, `EquipeIntrouvable`, `EquipeRattachee`, `versReponse`, `versSaisie`, `PageReferentiel`, `PageEquipes`, `verifierImports`, `Contexte` sont définis avant usage.
- **Risques à surveiller pendant l'exécution :** (1) Next doit accepter les ré-exports de gestionnaires (contrôlé par `verifier-build`, avec repli documenté) ; (2) `next build` dépend de variables factices : ne jamais le lancer sans elles ; (3) le codemod `redistribuer-imports` ne gère que les imports nommés (les autres formes se corrigent à la main, `tsc` les signale) ; (4) les tests neufs collés au code démarrent aussi le serveur MongoDB en mémoire (setup global), donc restent un peu plus lents.
