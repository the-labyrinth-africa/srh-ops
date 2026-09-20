# Refactoring R1 — Domaines `vehicules` et `equipements` : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrer les domaines `vehicules` et `equipements` (backend hexagonal + frontend « screaming ») en reproduisant le modèle validé par le pilote `equipes`, après avoir fermé trois trous du vérificateur d'architecture identifiés à la revue de R0. Aucun changement de comportement.

**Architecture:** Identique à R0 : `domain/` (types, erreurs, ports), `application/` (cas d'usage), `infrastructure/{en-memoire,mongoose}/`, `http/` (schéma Zod, présentation, contrôleurs), `composition.ts`, `index.ts` ; routes `src/app/api/**/route.ts` réduites à des ré-exports ; frontend `src/frontend/<fonctionnalité>/{pages,api,index.ts}` réutilisant `PageReferentiel` du design-system.

**Tech Stack:** Next.js 16 (`src/`), TypeScript, Mongoose, Zod, Vitest + mongodb-memory-server, ESLint 9.

**Spec / feuille de route:** `docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md` ; `docs/superpowers/plans/2026-09-20-refactor-architecture-master.md` (contraintes globales, recette, commande `verifier-build`, conventions) ; modèle de référence **déjà présent dans le dépôt** : `src/backend/equipes/**`, `src/frontend/equipes/**`, `tests/integration/equipes-caracterisation.test.ts`.

## Global Constraints

- **Aucun changement de comportement** : mêmes codes HTTP, mêmes corps JSON (dont `_id`, `createdAt`, `updatedAt`, `__v`), mêmes messages, même ordre des vérifications. Écarts connus et acceptés de R0 pour les nouveaux domaines aussi : la réponse 201 d'un POST liste `_id` en premier ; les lectures sont projetées par l'entité (champs hors schéma écrits hors Mongoose non renvoyés). Aucun autre écart n'est permis.
- Les tests existants ne changent que par leurs **chemins d'import**. Aucune assertion supprimée, affaiblie ou passée en `skip`.
- À chaque commit : `npx tsc --noEmit` propre, `npm run lint` (0 erreur ; 9 avertissements connus, aucun de plus), `npx vitest run` tout vert (583 tests au départ).
- Ne jamais lire ni afficher `.env.local` ; ne jamais lancer `npm run build`, `npm run seed`, `scripts/seed-admin.ts`, `scripts/send-test-mail.ts` ; aucun e-mail réel. Compilation Next : uniquement la commande `verifier-build` du plan maître (variables factices).
- Ne jamais stager `.agents/`, `.claude/`, `skills-lock.json`, `rapports/` (les autres dossiers exclus sont ignorés par Git). Commande d'ajout : `git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports'`.
- Après chaque passage du codemod `scripts/dev/remplacer-imports.mjs` : `git diff --stat`, et `git checkout -- <fichier>` pour tout fichier modifié à tort (fixtures de test, commentaires) — **jamais** `git reset`.
- Langue : dossiers de domaine et vocabulaire métier en français, suffixes techniques en anglais.
- Branche : `refactor/r1-vehicules-et-equipements` créée depuis `main` (≥ `08d71a3`).

### Faits vérifiés sur le code actuel (base du plan)

| | `vehicules` | `equipements` |
|---|---|---|
| Champs du schéma | `identification` (String, requis, **unique**), `type` (String, défaut `""`), `capacite` (Number, défaut `0`), `disponibilite` (Boolean, défaut `true`), timestamps | `nom` (String, requis), `type` (String, défaut `""`), `disponibilite` (Boolean, défaut `true`), timestamps |
| Tri de la liste | `{ identification: 1 }` | `{ nom: 1 }` |
| Validation Zod | `identification` min 1 « Immatriculation requise » ; `type` défaut `""` ; `capacite` = `z.coerce.number().min(0)` défaut 0 ; `disponibilite` défaut true | `nom` min 1 « Le nom est requis » ; `type` défaut `""` ; `disponibilite` défaut true |
| Suppression | `findByIdAndDelete` → 404 « Non trouvé » ou 200 `{success:true}` ; **aucun contrôle de rattachement** (pas de 409) | idem |
| Garde | `requireInternalAuth()` (lecture) / `requireInternalAuth(true)` (écriture) — identiques à `equipes` | idem |
| Doublon d'immatriculation | l'index unique fait lever une erreur Mongo non interceptée (500) : **à conserver tel quel** | sans objet |
| Importeurs du modèle hors domaine | `src/app/api/operations/[id]/route.ts`, `…/rapport/route.ts`, `tests/integration/operations-api.test.ts`, `recurrences-api.test.ts`, `src/backend/platform/base-de-donnees/enregistrement-modeles.ts` | `src/app/api/operations/[id]/route.ts`, `…/rapport/route.ts`, `enregistrement-modeles.ts` |
| Importeurs du validateur | `tests/unit/validators.test.ts` | `tests/unit/validators.test.ts` |
| Page | `src/app/(dashboard)/vehicules/page.tsx` : `PageReferentiel` (title « Flotte de véhicules », subtitle « Suivi de la flotte et disponibilité des véhicules. », icon `directions_car`, apiPath `/api/vehicules`, 4 champs dont `capacite` de type `number`, `emptyForm {identification:"",type:"",capacite:"0",disponibilite:true}`) | `src/app/(dashboard)/equipements/page.tsx` : title « Équipements & Cuves », subtitle « Inventaire des équipements de collecte et cuves. », icon `oil_barrel`, apiPath `/api/equipements`, 3 champs, `emptyForm {nom:"",type:"",disponibilite:true}` |

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `tests/architecture/verificateur.ts` + tests (modifier) | Trois durcissements (tâche 1) |
| `eslint.config.mjs` (modifier) | Paquets `mongodb`/`bson` interdits dans domain/application |
| `src/backend/vehicules/**`, `src/backend/equipements/**` (créer) | Domaines hexagonaux |
| `src/frontend/vehicules/**`, `src/frontend/equipements/**` (créer) | Fonctionnalités frontend |
| `tests/integration/vehicules-caracterisation.test.ts`, `tests/integration/equipements-caracterisation.test.ts` (créer) | Filet de comportement, écrit sur l'ancien code |

---

### Task 1: Durcissements du vérificateur d'architecture

**Files:**
- Modify: `tests/architecture/verificateur.ts`, `tests/architecture/verificateur.test.ts`, `eslint.config.mjs`

**Interfaces:**
- Produit : trois règles nouvelles ou étendues — (1) `mongodb` et `bson` interdits dans `domain/` et `application/` (comme `mongoose`) ; (2) tout fichier de `src/frontend/**` important `src/app/**` est une violation (règle `R4`) ; (3) `src/types/` retiré de `DOSSIERS_HERITES` (le dossier n'existe plus).

- [ ] **Step 0: Branche et base de départ.** `git switch -c refactor/r1-vehicules-et-equipements` (depuis `main`), puis `npx vitest run 2>&1 | grep -E "Test Files|Tests "` → 583 tests verts, `npx tsc --noEmit` propre, `npm run lint` 0 erreur.

- [ ] **Step 1: Écrire les tests qui échouent** — ajouter à `tests/architecture/verificateur.test.ts` (dans le `describe` du contexte existant ; reprendre l'aide `v(fichier, imports)` déjà définie dans ce fichier) :

```ts
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
  it("n'interdit plus src/types comme dossier hérité (il n'existe plus)", () => {
    expect(DOSSIERS_HERITES).not.toContain("src/types/");
  });
});
```

(importer `DOSSIERS_HERITES` depuis `./verificateur` en tête du fichier de test.)

Run: `npx vitest run tests/architecture/verificateur.test.ts` → FAIL (les trois cas).

- [ ] **Step 2: Implémenter.** Dans `tests/architecture/verificateur.ts` :
  - `PAQUETS_INTERDITS_DOMAINE` : remplacer la première expression par `/^(mongoose|mongodb|bson|nodemailer|bcryptjs|exceljs)(\/|$)/`.
  - `DOSSIERS_HERITES` : `["src/lib/", "src/models/", "src/components/", "src/hooks/"]`.
  - Dans `verifierImports`, à côté de la règle R4 existante (« le frontend n'importe jamais le backend »), ajouter : si le fichier est dans `src/frontend/` et que `cible.startsWith("src/app/")`, signaler `R4` (message : « le frontend n'importe jamais src/app »).
  - `eslint.config.mjs` : dans le bloc `domain/application`, ajouter `"mongodb"` et `"bson"` à la liste `paths` et `"mongodb/*"`, `"bson/*"` aux `patterns` ; dans le bloc frontend, ajouter le motif `{ group: ["@/app/*", "@/app/**"], message: "Le frontend n'importe jamais src/app." }`.

- [ ] **Step 3: Relancer** — `npx vitest run tests/architecture` → PASS (tous les tests, anciens et nouveaux). Prouver l'ESLint : créer **temporairement** `src/frontend/zz-tmp/x.ts` avec `import "@/app/layout";` et `src/backend/zz-tmp/domain/x.ts` avec `import "mongodb";`, lancer `npx eslint src/frontend/zz-tmp src/backend/zz-tmp` → 2 erreurs `no-restricted-imports` ; **supprimer les deux fichiers** (ne pas les commiter).

- [ ] **Step 4: Vérifier et commit**

Run: `npx tsc --noEmit && npm run lint 2>&1 | tail -1 && npx vitest run 2>&1 | grep -E "Test Files|Tests "`

```bash
git add tests/architecture eslint.config.mjs
git commit -m "refactor(architecture): mongodb/bson interdits dans le métier, frontend sans src/app, src/types retiré des dossiers hérités"
```


---

### Task 2: Domaine `vehicules` — backend hexagonal

**Files:**
- Create: `src/backend/vehicules/domain/{vehicule,erreurs,ports}.ts`, `application/cas-d-usage.ts` (+ `.test.ts`), `infrastructure/en-memoire/vehicule.repository.en-memoire.ts`, `infrastructure/mongoose/{vehicule.model,vehicule.repository.mongoose}.ts` (+ `vehicule.repository.mongoose.test.ts`), `http/{vehicule.schema,presentation,liste.controleur,detail.controleur}.ts`, `composition.ts`, `index.ts`
- Create (filet): `tests/integration/vehicules-caracterisation.test.ts`
- Move: `src/models/Vehicule.ts` → `src/backend/vehicules/infrastructure/mongoose/vehicule.model.ts` ; `src/lib/validators/vehicule.ts` → `src/backend/vehicules/http/vehicule.schema.ts`
- Modify: `src/app/api/vehicules/route.ts`, `src/app/api/vehicules/[id]/route.ts`, `src/backend/platform/base-de-donnees/enregistrement-modeles.ts` (ligne Vehicule, ordre conservé), importeurs (codemod), `tests/architecture/regles-de-dependance.test.ts`

**Interfaces:**
- Produit : `Vehicule`, `VehiculeSaisie` ; `VehiculeRepository` ; `creerCasDUsageVehicules({ vehicules })` → `{ lister, obtenir, creer, modifier, supprimer }` ; erreur `VehiculeIntrouvable` (message `"Non trouvé"`) ; `casDUsageVehicules` (composition).
- Consomme : `connectDB` (`@/backend/platform/base-de-donnees/connexion`), `guardObjectId` (`@/backend/platform/http/identifiants`), `requireInternalAuth` (`@/lib/api-auth`, transitoire).

- [ ] **Step 1: Caractérisation (filet), sur le code ACTUEL.** Lire `tests/integration/equipes-caracterisation.test.ts` (modèle de session simulée, de helpers et de cas) et `tests/integration/referentiels-api.test.ts`. Écrire `tests/integration/vehicules-caracterisation.test.ts` couvrant au minimum, pour `@/app/api/vehicules/route` et `@/app/api/vehicules/[id]/route` : liste triée par `identification` (avec **valeurs**, pas seulement les noms) ; POST 201 avec l'**ensemble exact de clés** `_id, identification, type, capacite, disponibilite, createdAt, updatedAt, __v` (défauts : `type ""`, `capacite 0`, `disponibilite true`) ; `capacite` fournie en chaîne `"12"` → nombre 12 (coercition Zod) ; POST 400 (identification vide, `capacite` négative, corps de types faux) avec corps `error.flatten()` ; **doublon d'immatriculation** : le second POST identique lève une erreur (assertion `rejects.toThrow()`, l'index unique doit être construit : `await Vehicule.init()` en `beforeAll`, importer le modèle depuis `@/models/Vehicule`) ; GET par identifiant 200 / 404 `{"error":"Non trouvé"}` / 400 identifiant invalide ; PUT 200 (défauts appliqués), 404, 400 corps, 400 identifiant ; DELETE 200 `{success:true}` / 404 / 400 ; **DELETE sans contrôle de rattachement** (un véhicule référencé par une opération est supprimé sans erreur : créer une `Operation` avec `vehiculeId`, supprimer, vérifier 200) ; 401 sans session ; 403 pour `chauffeur` et `client` ; 403 `MUST_CHANGE_PASSWORD` ; corps JSON malformé en POST et PUT (`rejects.toThrow()`). Lancer : `npx vitest run tests/integration/vehicules-caracterisation.test.ts` → **PASS**. Commit isolé :

```bash
git add tests/integration/vehicules-caracterisation.test.ts
git commit -m "test(vehicules): tests de caractérisation avant migration"
```

- [ ] **Step 2: Domaine, ports, faux en mémoire.**

```ts
// src/backend/vehicules/domain/vehicule.ts
export interface Vehicule {
  id: string;
  identification: string;
  type: string;
  capacite: number;
  disponibilite: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Numéro de révision technique conservé pour reproduire la réponse JSON à l'identique (`__v`). */
  revision?: number;
}

export interface VehiculeSaisie {
  identification: string;
  type: string;
  capacite: number;
  disponibilite: boolean;
}
```

```ts
// src/backend/vehicules/domain/erreurs.ts
export class VehiculeIntrouvable extends Error {
  constructor() {
    super("Non trouvé");
    this.name = "VehiculeIntrouvable";
  }
}
```

```ts
// src/backend/vehicules/domain/ports.ts
import type { Vehicule, VehiculeSaisie } from "./vehicule";

export interface VehiculeRepository {
  /** Tous les véhicules, triés par immatriculation croissante (ordre binaire de MongoDB). */
  lister(): Promise<Vehicule[]>;
  trouverParId(id: string): Promise<Vehicule | null>;
  /** Peut échouer (erreur du dépôt) si l'immatriculation existe déjà : l'erreur n'est pas interceptée. */
  creer(saisie: VehiculeSaisie): Promise<Vehicule>;
  /** null si le véhicule n'existe pas. */
  modifier(id: string, saisie: VehiculeSaisie): Promise<Vehicule | null>;
  /** false si le véhicule n'existait pas. */
  supprimer(id: string): Promise<boolean>;
}
```

```ts
// src/backend/vehicules/infrastructure/en-memoire/vehicule.repository.en-memoire.ts
import type { Vehicule, VehiculeSaisie } from "../../domain/vehicule";
import type { VehiculeRepository } from "../../domain/ports";

/**
 * Dépôt en mémoire pour les tests des cas d'usage. Fidèle au dépôt Mongoose sur le tri
 * (comparaison binaire, comme MongoDB sans collation) et la révision initiale ; il ne
 * reproduit PAS l'unicité de l'immatriculation (portée par l'index de la base).
 */
export class VehiculeRepositoryEnMemoire implements VehiculeRepository {
  private readonly donnees = new Map<string, Vehicule>();
  private compteur = 0;

  async lister(): Promise<Vehicule[]> {
    return [...this.donnees.values()].sort((a, b) =>
      a.identification < b.identification ? -1 : a.identification > b.identification ? 1 : 0
    );
  }

  async trouverParId(id: string): Promise<Vehicule | null> {
    return this.donnees.get(id) ?? null;
  }

  async creer(saisie: VehiculeSaisie): Promise<Vehicule> {
    this.compteur += 1;
    const maintenant = new Date();
    const vehicule: Vehicule = {
      id: `vehicule-${this.compteur}`,
      ...saisie,
      createdAt: maintenant,
      updatedAt: maintenant,
      revision: 0,
    };
    this.donnees.set(vehicule.id, vehicule);
    return vehicule;
  }

  async modifier(id: string, saisie: VehiculeSaisie): Promise<Vehicule | null> {
    const existant = this.donnees.get(id);
    if (!existant) return null;
    const modifie: Vehicule = { ...existant, ...saisie, updatedAt: new Date() };
    this.donnees.set(id, modifie);
    return modifie;
  }

  async supprimer(id: string): Promise<boolean> {
    return this.donnees.delete(id);
  }
}
```

- [ ] **Step 3: Test des cas d'usage (rouge), puis cas d'usage (vert).**

```ts
// src/backend/vehicules/application/cas-d-usage.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { creerCasDUsageVehicules } from "./cas-d-usage";
import { VehiculeIntrouvable } from "../domain/erreurs";
import { VehiculeRepositoryEnMemoire } from "../infrastructure/en-memoire/vehicule.repository.en-memoire";

let cas: ReturnType<typeof creerCasDUsageVehicules>;
const saisie = (identification: string) => ({ identification, type: "Citerne", capacite: 5000, disponibilite: true });

beforeEach(() => {
  cas = creerCasDUsageVehicules({ vehicules: new VehiculeRepositoryEnMemoire() });
});

describe("cas d'usage des véhicules", () => {
  it("liste les véhicules triés par immatriculation (ordre binaire : majuscules avant minuscules)", async () => {
    await cas.creer(saisie("b-2"));
    await cas.creer(saisie("A-1"));
    expect((await cas.lister()).map((v) => v.identification)).toEqual(["A-1", "b-2"]);
  });

  it("crée puis obtient un véhicule avec sa révision initiale", async () => {
    const cree = await cas.creer(saisie("1234-AB-01"));
    expect(cree.revision).toBe(0);
    expect(await cas.obtenir(cree.id)).toMatchObject({ identification: "1234-AB-01", capacite: 5000 });
  });

  it("obtenir un véhicule inconnu lève VehiculeIntrouvable", async () => {
    await expect(cas.obtenir("inconnu")).rejects.toBeInstanceOf(VehiculeIntrouvable);
  });

  it("modifie un véhicule existant et refuse un véhicule inconnu", async () => {
    const cree = await cas.creer(saisie("A-1"));
    expect((await cas.modifier(cree.id, { ...saisie("A-2"), disponibilite: false })).disponibilite).toBe(false);
    await expect(cas.modifier("inconnu", saisie("A-3"))).rejects.toBeInstanceOf(VehiculeIntrouvable);
  });

  it("supprime un véhicule sans contrôle de rattachement et refuse un véhicule inconnu", async () => {
    const cree = await cas.creer(saisie("A-1"));
    await cas.supprimer(cree.id);
    await expect(cas.obtenir(cree.id)).rejects.toBeInstanceOf(VehiculeIntrouvable);
    await expect(cas.supprimer(cree.id)).rejects.toBeInstanceOf(VehiculeIntrouvable);
  });
});
```

Run : `npx vitest run src/backend/vehicules/application` → FAIL (module absent). Puis :

```ts
// src/backend/vehicules/application/cas-d-usage.ts
import type { Vehicule, VehiculeSaisie } from "../domain/vehicule";
import { VehiculeIntrouvable } from "../domain/erreurs";
import type { VehiculeRepository } from "../domain/ports";

export interface DependancesVehicules {
  vehicules: VehiculeRepository;
}

export function creerCasDUsageVehicules({ vehicules }: DependancesVehicules) {
  return {
    lister(): Promise<Vehicule[]> {
      return vehicules.lister();
    },

    async obtenir(id: string): Promise<Vehicule> {
      const vehicule = await vehicules.trouverParId(id);
      if (!vehicule) throw new VehiculeIntrouvable();
      return vehicule;
    },

    creer(saisie: VehiculeSaisie): Promise<Vehicule> {
      return vehicules.creer(saisie);
    },

    async modifier(id: string, saisie: VehiculeSaisie): Promise<Vehicule> {
      const vehicule = await vehicules.modifier(id, saisie);
      if (!vehicule) throw new VehiculeIntrouvable();
      return vehicule;
    },

    async supprimer(id: string): Promise<void> {
      // Aucun contrôle de rattachement : identique à la route d'origine.
      if (!(await vehicules.supprimer(id))) throw new VehiculeIntrouvable();
    },
  };
}

export type CasDUsageVehicules = ReturnType<typeof creerCasDUsageVehicules>;
```

Run : `npx vitest run src/backend/vehicules/application` → PASS.

- [ ] **Step 4: Adaptateur Mongoose + test de contrat.**

```bash
mkdir -p src/backend/vehicules/infrastructure/mongoose src/backend/vehicules/http
git mv src/models/Vehicule.ts src/backend/vehicules/infrastructure/mongoose/vehicule.model.ts
git mv src/lib/validators/vehicule.ts src/backend/vehicules/http/vehicule.schema.ts
node scripts/dev/remplacer-imports.mjs "@/models/Vehicule" "@/backend/vehicules/infrastructure/mongoose/vehicule.model"
node scripts/dev/remplacer-imports.mjs "@/lib/validators/vehicule" "@/backend/vehicules/http/vehicule.schema"
git diff --stat
```
Relire `git diff --stat` : annuler avec `git checkout -- <fichier>` tout fichier modifié à tort (fixtures de `tests/architecture/verificateur.test.ts`, commentaires). Mettre à jour à la main `scripts/seed-admin.ts` (import relatif du modèle Vehicule) et, dans `enregistrement-modeles.ts`, remplacer `import "@/models/Vehicule";` par `import "@/backend/vehicules/infrastructure/mongoose/vehicule.model";` **à la même place** (4ᵉ ligne). Le schéma du modèle ne change pas.

```ts
// src/backend/vehicules/infrastructure/mongoose/vehicule.repository.mongoose.ts
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type { Vehicule, VehiculeSaisie } from "../../domain/vehicule";
import type { VehiculeRepository } from "../../domain/ports";
import { Vehicule as VehiculeModel } from "./vehicule.model";

interface DocumentVehicule {
  _id: unknown;
  identification: string;
  type?: string;
  capacite?: number;
  disponibilite: boolean;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

function versEntite(doc: DocumentVehicule): Vehicule {
  return {
    id: String(doc._id),
    identification: doc.identification,
    type: doc.type ?? "",
    capacite: doc.capacite ?? 0,
    disponibilite: doc.disponibilite,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    revision: doc.__v,
  };
}

export class VehiculeRepositoryMongoose implements VehiculeRepository {
  async lister(): Promise<Vehicule[]> {
    await connectDB();
    const docs = (await VehiculeModel.find().sort({ identification: 1 }).lean()) as DocumentVehicule[];
    return docs.map(versEntite);
  }

  async trouverParId(id: string): Promise<Vehicule | null> {
    await connectDB();
    const doc = (await VehiculeModel.findById(id).lean()) as DocumentVehicule | null;
    return doc ? versEntite(doc) : null;
  }

  async creer(saisie: VehiculeSaisie): Promise<Vehicule> {
    await connectDB();
    const doc = await VehiculeModel.create(saisie);
    return versEntite(doc.toObject() as DocumentVehicule);
  }

  async modifier(id: string, saisie: VehiculeSaisie): Promise<Vehicule | null> {
    await connectDB();
    const doc = (await VehiculeModel.findByIdAndUpdate(id, saisie, { new: true }).lean()) as DocumentVehicule | null;
    return doc ? versEntite(doc) : null;
  }

  async supprimer(id: string): Promise<boolean> {
    await connectDB();
    return Boolean(await VehiculeModel.findByIdAndDelete(id));
  }
}
```

```ts
// src/backend/vehicules/infrastructure/mongoose/vehicule.repository.mongoose.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { VehiculeRepositoryMongoose } from "./vehicule.repository.mongoose";
import { Vehicule as VehiculeModel } from "./vehicule.model";

const depot = new VehiculeRepositoryMongoose();
const saisie = (identification: string) => ({ identification, type: "Citerne", capacite: 5000, disponibilite: true });

beforeAll(async () => {
  await VehiculeModel.init(); // l'index unique de l'immatriculation doit exister avant les tests de doublon
});

describe("VehiculeRepositoryMongoose (contrat)", () => {
  it("crée puis relit un véhicule avec identifiant, dates et révision", async () => {
    const cree = await depot.creer(saisie("1234-AB-01"));
    expect(cree.id).toMatch(/^[a-f\d]{24}$/);
    expect(cree.revision).toBe(0);
    expect(cree.createdAt).toBeInstanceOf(Date);
    expect(await depot.trouverParId(cree.id)).toMatchObject({ identification: "1234-AB-01", capacite: 5000 });
  });

  it("liste par immatriculation croissante (ordre binaire)", async () => {
    await depot.creer(saisie("b-2"));
    await depot.creer(saisie("A-1"));
    expect((await depot.lister()).map((v) => v.identification)).toEqual(["A-1", "b-2"]);
  });

  it("refuse une immatriculation déjà utilisée (erreur du dépôt non interceptée)", async () => {
    await depot.creer(saisie("DOUBLON"));
    await expect(depot.creer(saisie("DOUBLON"))).rejects.toThrow();
  });

  it("modifie ; null pour un identifiant inconnu", async () => {
    const cree = await depot.creer(saisie("A-1"));
    expect(await depot.modifier(cree.id, { ...saisie("A-2"), capacite: 1 })).toMatchObject({ identification: "A-2", capacite: 1 });
    expect(await depot.modifier("507f1f77bcf86cd799439099", saisie("Z"))).toBeNull();
  });

  it("supprime et signale l'absence", async () => {
    const cree = await depot.creer(saisie("A-1"));
    expect(await depot.supprimer(cree.id)).toBe(true);
    expect(await depot.supprimer(cree.id)).toBe(false);
  });
});
```

Run : `npx vitest run src/backend/vehicules/infrastructure` → PASS.

- [ ] **Step 5: Contrôleurs, composition, index, routes.**

Dans `src/backend/vehicules/http/vehicule.schema.ts` (fichier déplacé, contenu inchangé) : ajouter **en haut** `import type { VehiculeSaisie } from "../domain/vehicule";` et, à la suite du schéma et du type `VehiculeInput` :

```ts
export function versSaisie(entree: VehiculeInput): VehiculeSaisie {
  return {
    identification: entree.identification,
    type: entree.type,
    capacite: entree.capacite,
    disponibilite: entree.disponibilite,
  };
}
```

```ts
// src/backend/vehicules/http/presentation.ts
import type { Vehicule } from "../domain/vehicule";

/** Forme JSON historique de l'API (document Mongoose sérialisé). */
export function versReponse(vehicule: Vehicule) {
  return {
    _id: vehicule.id,
    identification: vehicule.identification,
    type: vehicule.type,
    capacite: vehicule.capacite,
    disponibilite: vehicule.disponibilite,
    createdAt: vehicule.createdAt,
    updatedAt: vehicule.updatedAt,
    __v: vehicule.revision,
  };
}
```

```ts
// src/backend/vehicules/composition.ts
import { creerCasDUsageVehicules } from "./application/cas-d-usage";
import { VehiculeRepositoryMongoose } from "./infrastructure/mongoose/vehicule.repository.mongoose";

export const casDUsageVehicules = creerCasDUsageVehicules({ vehicules: new VehiculeRepositoryMongoose() });
```

```ts
// src/backend/vehicules/index.ts
// API publique du domaine `vehicules` pour les autres domaines : aucune pour l'instant.
export {};
```

```ts
// src/backend/vehicules/http/liste.controleur.ts
import { NextRequest, NextResponse } from "next/server";
import { requireInternalAuth } from "@/lib/api-auth"; // transitoire : migre avec `comptes` (R3)
import { casDUsageVehicules } from "../composition";
import { vehiculeSchema, versSaisie } from "./vehicule.schema";
import { versReponse } from "./presentation";

export async function GET() {
  const auth = await requireInternalAuth();
  if (auth.error) return auth.error;

  const vehicules = await casDUsageVehicules.lister();
  return NextResponse.json(vehicules.map(versReponse));
}

export async function POST(req: NextRequest) {
  const auth = await requireInternalAuth(true);
  if (auth.error) return auth.error;

  const body = await req.json();
  const parsed = vehiculeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const vehicule = await casDUsageVehicules.creer(versSaisie(parsed.data));
  return NextResponse.json(versReponse(vehicule), { status: 201 });
}
```

```ts
// src/backend/vehicules/http/detail.controleur.ts
import { NextRequest, NextResponse } from "next/server";
import { requireInternalAuth } from "@/lib/api-auth"; // transitoire : migre avec `comptes` (R3)
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { VehiculeIntrouvable } from "../domain/erreurs";
import { casDUsageVehicules } from "../composition";
import { vehiculeSchema, versSaisie } from "./vehicule.schema";
import { versReponse } from "./presentation";

type Params = { params: Promise<{ id: string }> };

function reponseErreur(error: unknown) {
  if (error instanceof VehiculeIntrouvable) return NextResponse.json({ error: error.message }, { status: 404 });
  throw error;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireInternalAuth();
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  try {
    return NextResponse.json(versReponse(await casDUsageVehicules.obtenir(id)));
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
  const parsed = vehiculeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    return NextResponse.json(versReponse(await casDUsageVehicules.modifier(id, versSaisie(parsed.data))));
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
    await casDUsageVehicules.supprimer(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return reponseErreur(error);
  }
}
```

```ts
// src/app/api/vehicules/route.ts
export { GET, POST } from "@/backend/vehicules/http/liste.controleur";
```

```ts
// src/app/api/vehicules/[id]/route.ts
export { GET, PUT, DELETE } from "@/backend/vehicules/http/detail.controleur";
```

- [ ] **Step 6: Déclarer le domaine migré.** Dans `tests/architecture/regles-de-dependance.test.ts` : `domainesBackendMigres: ["equipes", "vehicules"]` ; `npx vitest run tests/architecture` → PASS. Prouver que la règle mord : ajouter **temporairement** `import "mongoose";` dans `src/backend/vehicules/application/cas-d-usage.ts`, constater l'échec `R2`, annuler.

- [ ] **Step 7: Vérifier**

Run: `npx tsc --noEmit && echo "tsc ok" && npm run lint 2>&1 | tail -1 && npx vitest run 2>&1 | grep -E "Test Files|Tests "`
Expected : tout vert ; `vehicules-caracterisation`, `referentiels-api`, `operations-api`, `recurrences-api` et `validators` passent avec **seulement** des changements de chemins d'import. Puis `verifier-build` (plan maître) → succès.

- [ ] **Step 8: Commit**

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports'
git status --short | head -30
git commit -m "refactor(vehicules): domaine hexagonal (domain, cas d'usage, adaptateurs Mongoose, contrôleurs)"
```

---

### Task 3: Domaine `equipements` — backend hexagonal

Structure **identique** à la tâche 2. Lire d'abord les fichiers réels de `src/backend/vehicules/**` (créés à la tâche 2) et de `tests/integration/vehicules-caracterisation.test.ts`, puis appliquer la table de substitution ci-dessous. Les seules différences sont listées ; tout le reste (cas d'usage, contrôleurs, composition, routes, test de cas d'usage, faux, tests de contrat sauf unicité) est la transposition littérale.

**Files:** mêmes noms que la tâche 2 avec `equipement` à la place de `vehicule` : `src/backend/equipements/{domain,application,infrastructure,http}/…`, `composition.ts`, `index.ts` ; déplacer `src/models/Equipement.ts` → `src/backend/equipements/infrastructure/mongoose/equipement.model.ts` et `src/lib/validators/equipement.ts` → `src/backend/equipements/http/equipement.schema.ts` ; modifier `src/app/api/equipements/route.ts` et `[id]/route.ts`, la ligne `Equipement` de `enregistrement-modeles.ts` (5ᵉ ligne), `scripts/seed-admin.ts`, importeurs (codemod : `@/models/Equipement`, `@/lib/validators/equipement` ; importeurs connus : `operations/[id]/route.ts`, `operations/[id]/rapport/route.ts`, `tests/unit/validators.test.ts`), `tests/architecture/regles-de-dependance.test.ts` (`["equipes", "vehicules", "equipements"]`) ; créer `tests/integration/equipements-caracterisation.test.ts`.

**Table de substitution :**

| Élément | `vehicules` (tâche 2) | `equipements` |
|---|---|---|
| Entité `Equipement` | `identification, type, capacite, disponibilite` | `nom: string; type: string; disponibilite: boolean` (+ `id`, `createdAt`, `updatedAt`, `revision?`) |
| `EquipementSaisie` | idem 4 champs | `{ nom, type, disponibilite }` |
| Erreur | `VehiculeIntrouvable` | `EquipementIntrouvable` (message `"Non trouvé"`) |
| Tri liste (port, faux, adaptateur) | `identification` | `nom` (adaptateur : `.sort({ nom: 1 })`) |
| `versEntite` | `type ?? ""`, `capacite ?? 0` | `type ?? ""` (pas de capacité) |
| `versSaisie` (schéma) | 4 champs | `{ nom, type, disponibilite }` |
| `versReponse` | clés `_id, identification, type, capacite, disponibilite, createdAt, updatedAt, __v` | clés `_id, nom, type, disponibilite, createdAt, updatedAt, __v` |
| Filet de caractérisation | inclut doublon d'immatriculation et coercition de `capacite` | **sans** doublon ni capacité ; ajouter : tri par `nom` avec valeurs ; POST 400 sur `nom` vide ; défauts `type ""`, `disponibilite true` ; suppression d'un équipement référencé par une opération (`equipementIds`) → 200 sans erreur |
| Test de contrat | inclut le test de doublon et `Vehicule.init()` | **sans** test de doublon ni `init()` |
| Message de validation | « Immatriculation requise » | « Le nom est requis » (schéma déplacé sans modification) |

- [ ] **Step 1: Caractérisation** sur l'ancien code (comme la tâche 2, step 1) ; commit isolé `test(equipements): tests de caractérisation avant migration`.
- [ ] **Step 2: Domaine, ports, faux** (transposition des fichiers `vehicules`).
- [ ] **Step 3: Test des cas d'usage (rouge) puis cas d'usage (vert)** — transposer `cas-d-usage.test.ts` : tri par `nom` binaire (`"b"` après `"A"`), création avec révision 0, `obtenir/modifier/supprimer` inconnus → `EquipementIntrouvable`, suppression sans rattachement.
- [ ] **Step 4: Modèle déplacé (codemods + relecture du diff), adaptateur Mongoose, test de contrat.**
- [ ] **Step 5: Contrôleurs, composition, index, routes** (transposition ; mêmes gardes et mêmes ordres de vérification).
- [ ] **Step 6: Déclarer le domaine migré ; prouver la règle par injection temporaire.**
- [ ] **Step 7: Vérifier** — `tsc`, `lint`, `vitest` (tout vert), `verifier-build`.
- [ ] **Step 8: Commit**

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports'
git commit -m "refactor(equipements): domaine hexagonal (domain, cas d'usage, adaptateurs Mongoose, contrôleurs)"
```

---

### Task 4: Fonctionnalités frontend `vehicules` et `equipements`

**Files:**
- Create: `src/frontend/vehicules/{pages/PageVehicules.tsx,api/chemins.ts,index.ts}`, `src/frontend/equipements/{pages/PageEquipements.tsx,api/chemins.ts,index.ts}`
- Modify: `src/app/(dashboard)/vehicules/page.tsx`, `src/app/(dashboard)/equipements/page.tsx`, `tests/architecture/regles-de-dependance.test.ts`

**Interfaces:**
- Produit : `PageVehicules()`, `PageEquipements()` ; `CHEMIN_API_VEHICULES = "/api/vehicules"`, `CHEMIN_API_EQUIPEMENTS = "/api/equipements"`.
- Consomme : `PageReferentiel` (`@/frontend/design-system/PageReferentiel`).

- [ ] **Step 1: Créer les fonctionnalités** (sur le modèle de `src/frontend/equipes/**`) :

```ts
// src/frontend/vehicules/api/chemins.ts
export const CHEMIN_API_VEHICULES = "/api/vehicules";
```

```tsx
// src/frontend/vehicules/pages/PageVehicules.tsx
import { PageReferentiel } from "@/frontend/design-system/PageReferentiel";
import { CHEMIN_API_VEHICULES } from "../api/chemins";

export function PageVehicules() {
  return (
    <PageReferentiel
      title="Flotte de véhicules"
      subtitle="Suivi de la flotte et disponibilité des véhicules."
      icon="directions_car"
      apiPath={CHEMIN_API_VEHICULES}
      fields={[
        { key: "identification", label: "Immatriculation", required: true },
        { key: "type", label: "Type" },
        { key: "capacite", label: "Capacité (L)", type: "number" },
        { key: "disponibilite", label: "Disponibilité", type: "checkbox" },
      ]}
      emptyForm={{ identification: "", type: "", capacite: "0", disponibilite: true }}
    />
  );
}
```

```ts
// src/frontend/vehicules/index.ts
export { PageVehicules } from "./pages/PageVehicules";
```

```ts
// src/frontend/equipements/api/chemins.ts
export const CHEMIN_API_EQUIPEMENTS = "/api/equipements";
```

```tsx
// src/frontend/equipements/pages/PageEquipements.tsx
import { PageReferentiel } from "@/frontend/design-system/PageReferentiel";
import { CHEMIN_API_EQUIPEMENTS } from "../api/chemins";

export function PageEquipements() {
  return (
    <PageReferentiel
      title="Équipements & Cuves"
      subtitle="Inventaire des équipements de collecte et cuves."
      icon="oil_barrel"
      apiPath={CHEMIN_API_EQUIPEMENTS}
      fields={[
        { key: "nom", label: "Nom", required: true },
        { key: "type", label: "Type" },
        { key: "disponibilite", label: "Disponibilité", type: "checkbox" },
      ]}
      emptyForm={{ nom: "", type: "", disponibilite: true }}
    />
  );
}
```

```ts
// src/frontend/equipements/index.ts
export { PageEquipements } from "./pages/PageEquipements";
```

Les valeurs (titres, sous-titres, icônes, champs, `emptyForm`) doivent être **identiques caractère pour caractère** à celles des pages actuelles (voir la table des faits) : comparer avec `git show HEAD:src/app/\(dashboard\)/vehicules/page.tsx` avant de les remplacer.

- [ ] **Step 2: Réduire les pages `src/app`**

```tsx
// src/app/(dashboard)/vehicules/page.tsx
import { PageVehicules } from "@/frontend/vehicules";
import { requirePageAccess } from "@/lib/page-auth";

export default async function VehiculesPage() {
  await requirePageAccess("/vehicules");
  return <PageVehicules />;
}
```

```tsx
// src/app/(dashboard)/equipements/page.tsx
import { PageEquipements } from "@/frontend/equipements";
import { requirePageAccess } from "@/lib/page-auth";

export default async function EquipementsPage() {
  await requirePageAccess("/equipements");
  return <PageEquipements />;
}
```

- [ ] **Step 3: Déclarer les fonctionnalités migrées** : `fonctionnalitesFrontendMigrees: ["equipes", "vehicules", "equipements"]` ; `npx vitest run tests/architecture tests/unit/page-guards.test.ts` → PASS ; prouver la règle R4 par injection temporaire d'un import `@/backend/platform/http/identifiants` dans `PageVehicules.tsx` (échec du test d'architecture **et** de `npm run lint`), puis annuler.

- [ ] **Step 4: Vérifier** — `tsc`, `lint`, `vitest` complets, `verifier-build`.

- [ ] **Step 5: Commit**

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports'
git commit -m "refactor(vehicules,equipements): fonctionnalités frontend vehicules et equipements"
```

---

### Task 5: Documentation, statuts et revue du jalon

**Files:** `README.md`, `docs/superpowers/plans/2026-09-20-refactor-architecture-master.md`, `docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md`

- [ ] **Step 1: README.** Dans la section « Architecture », mettre à jour la liste des domaines migrés (`equipes`, `vehicules`, `equipements`) et celle des domaines encore dans les dossiers hérités ; vérifier que chaque chemin cité existe.
- [ ] **Step 2: Statuts.** Spec : « R0 et R1 réalisés ; jalons R2 à R9 à venir ». Plan maître : ligne R1 → **Réalisé** ; ajouter dans « Enseignements » : « R1 : le modèle du pilote se reproduit sans écart (deux domaines migrés en un jalon) ; le vérificateur interdit désormais `mongodb`/`bson` dans le métier et le frontend n'importe plus `src/app` ».
- [ ] **Step 3: Vérification complète** : `npx tsc --noEmit && npm run lint && npx vitest run`, puis `verifier-build`.
- [ ] **Step 4: Non-régression ciblée** (à consigner dans le rapport) : `git diff main --stat -- tests/integration tests/unit` — les tests existants ne changent que par des chemins d'import (lister tout autre changement) ; comparer les réponses JSON des routes `vehicules` et `equipements` avant/après avec la méthode de R0 (archive de `main` et de la branche, même sonde, corps bruts) sur au moins : liste, POST 201/400, GET par id 200/404/400, PUT 200/404, DELETE 200/404, sans session (401), chauffeur (403), plus le doublon d'immatriculation.
- [ ] **Step 5: Commit**

```bash
git add README.md docs/superpowers
git commit -m "docs: statuts du jalon R1 et domaines migrés"
```

- [ ] **Step 6: Revue du jalon** (skill `superpowers:requesting-code-review`, modèle le plus capable). Critères : aucun changement de comportement sur les 10 routes (les deux écarts connus exceptés) ; règles R1 à R5 réellement appliquées (injections dans les deux nouveaux domaines) ; codemods sans import oublié (`@/models/Vehicule`, `@/models/Equipement`, `@/lib/validators/vehicule`, `@/lib/validators/equipement` introuvables) ; tests existants inchangés hors chemins ; pages frontend strictement identiques aux anciennes ; `enregistrement-modeles.ts` dans le même ordre ; CI verte sur clone propre.

---

## Auto-relecture

- **Couverture de la spec (jalon R1) :** durcissements du vérificateur (tâche 1) ; `vehicules` (tâche 2) et `equipements` (tâche 3) backend ; frontends (tâche 4) ; documentation et revue (tâche 5).
- **Cohérence des noms :** `Vehicule/VehiculeSaisie/VehiculeRepository/VehiculeIntrouvable/creerCasDUsageVehicules/casDUsageVehicules/VehiculeRepositoryEnMemoire/VehiculeRepositoryMongoose/PageVehicules/CHEMIN_API_VEHICULES` et leurs homologues `Equipement*` sont définis à la tâche 2 ou par la table de substitution de la tâche 3.
- **Points de vigilance :** (1) `capacite` : `z.coerce.number()` — la valeur est déjà un nombre après validation, `versSaisie` la transmet telle quelle ; (2) l'unicité de l'immatriculation n'est portée que par l'index Mongo : le test de contrat doit appeler `VehiculeModel.init()` avant les tests de doublon ; (3) la tâche 3 est volontairement décrite par transposition d'un code **déjà présent dans le dépôt** (tâche 2) : l'exécutant doit lire ces fichiers réels avant d'écrire ; (4) `operations` importe encore directement les modèles déplacés (toléré, corrigé aux jalons R3/R4).
