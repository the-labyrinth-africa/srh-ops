# Refactoring R4a — Domaine `operations` : statuts, conflits, visibilité : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser le socle `domain/` du domaine `operations` — transitions de statut, statut effectif, détection de conflits d'affectation (avec son port `Affectations` et son adaptateur Mongoose), politique de visibilité par rôle/client/équipe — et supprimer `src/lib/conflicts.ts` et `src/lib/status-transitions.ts`. Premier des quatre sous-plans de R4. **Hors périmètre :** les six fichiers `src/app/api/operations/**/route.ts` restent des routes héritées (4b : CRUD + planning ; 4c : statut/terrain/photos ; 4d : rapport PDF) ; le modèle `src/models/Operation.ts` et `src/lib/validators/operation.ts` ne bougent pas (4b).

**Architecture:** `src/backend/operations/` naît avec `domain/{statut-effectif,conflits,visibilite,ports}.ts`, `application/verifier-conflits.ts`, `infrastructure/{en-memoire,mongoose}/affectations.*.ts`, `composition.ts`, `index.ts`. La table des transitions (`canTransition`, `getNextStatuses`) va dans `src/shared/operations/transitions.ts` parce que deux composants frontend l'utilisent (règle R4 : le frontend n'importe jamais le backend). Les routes héritées et les tests existants ne changent que par leurs chemins d'import : les trois fonctions publiques gardent **exactement** leurs noms et signatures actuels (`checkAssignmentConflicts`, `canTransition`/`getNextStatuses`, `computeEffectiveStatus`), comme R3c l'a fait pour `requireAuth`.

**Tech Stack:** Next.js 16 (`src/`), TypeScript, Mongoose 8, Zod, Vitest + mongodb-memory-server, ESLint 9.

**Spec / feuille de route:** `docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md` (§5 `Acteur` ; §6 ligne `operations` : « transitions de statut ; chevauchement (conflits) ; […] visibilité par rôle et équipe ; statut effectif | … | `OperationRepository`, `Affectations`, `GenerateurRapportPdf`, `Horloge` » ; §7 : « `lib/conflicts.ts`, `lib/status-transitions.ts` → `backend/operations/domain` (+ adaptateur `Affectations`) ») ; `docs/superpowers/plans/2026-09-20-refactor-architecture-master.md` (contraintes globales, recette, enseignements R0-R3c) ; modèles de référence **déjà présents dans le dépôt** : `src/backend/equipes/**` (pilote), `src/backend/comptes/**` (ports locaux, `composition.ts`, `index.ts`).

## Global Constraints

- **Aucun changement de comportement** : mêmes codes HTTP, mêmes corps JSON, mêmes messages **au mot près** — en particulier le corps 409 `{ "error": "Conflit d'affectation", "conflicts": [{ "hasConflict": true, "message": "…", "conflictingOperationId": "…" }] }`, les deux messages « L'équipe est déjà affectée à une opération sur ce créneau » et « Le véhicule est déjà affecté à une opération sur ce créneau », et l'ordre des entrées (par opération candidate, équipe avant véhicule).
- **Un seul écart, délibéré et documenté :** l'adaptateur `AffectationsMongoose` appelle `await connectDB()` avant sa requête, comme tous les autres adaptateurs du dépôt. L'ancien `checkAssignmentConflicts` ne le faisait pas, alors que `POST /api/operations` et `PUT /api/operations/[id]` l'appellent **avant** leur propre `connectDB()` (fragilité latente sur instance froide). Aucun chemin qui réussissait ne change de réponse.
- Les tests existants ne changent que par leurs **chemins d'import**. Aucune assertion supprimée, affaiblie ou passée en `skip`.
- À chaque commit : `npx tsc --noEmit` propre, `npm run lint` (0 erreur), `npx vitest run` tout vert (**890 tests / 72 fichiers au départ**, mesuré sur `main` `4ae6b84`).
- Règles de dépendance : `domain/` n'importe que `@/shared/**` et lui-même (jamais `mongoose`, `next`, ni `@/backend/platform/**`, même en `type-only`) ; `application/` n'importe que `domain/`, `shared/` ; `index.ts` n'importe que `domain/`, `application/`, `composition.ts`.
- Ne jamais lire ni afficher `.env.local` ; ne jamais lancer `npm run build`, `npm run seed`, `scripts/seed-admin.ts` ni `scripts/send-test-mail.ts` ; aucun e-mail réel. Compilation Next : uniquement la commande `verifier-build` du plan maître.
- Ne jamais stager `.agents/`, `.claude/`, `skills-lock.json`, `rapports/`, `data/`, `package.json`. Commande d'ajout : `git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!data' ':!package.json'` puis `git status` (le code de retour de `git add` peut être non nul sans que ce soit une erreur — leçon R0).
- Après chaque codemod : `git diff --stat`, `git checkout -- <fichier>` pour tout fichier modifié à tort — **jamais** `git reset`. Vérifier par **grep indépendant** qu'aucun ancien chemin ne survit (leçon R3a : la liste d'importeurs de ce plan est un point de départ, pas une vérité).
- Langue : vocabulaire métier en français ; les trois fonctions publiques héritées gardent leur nom anglais (les tests ne changent que par leurs chemins).
- Branche : `refactor/r4a-operations-domaine` créée depuis `main` (`4ae6b84`). Fusion locale après revue ; aucun push sans accord.

### Faits vérifiés sur le code actuel (base du plan)

**`src/lib/status-transitions.ts`** (37 lignes) : table `ALLOWED_TRANSITIONS` ; `canTransition(from, to)` (identité toujours permise) ; `getNextStatuses(current)` ; `computeEffectiveStatus(statut, dateHeurePrevue)` — statut terminal (`Terminée`, `Rapportée`, `Annulée`) inchangé ; sinon `Retardée` si `dateHeurePrevue < new Date()` (**strict**) et statut ≠ `Retardée`. Sa constante locale `TERMINAL` a les mêmes valeurs que `TERMINAL_STATUSES` de `src/shared/operations/statuts.ts`.

**`src/lib/conflicts.ts`** (93 lignes) : `checkAssignmentConflicts({ dateHeurePrevue, dureeEstimeeMinutes = 120, equipeId?, vehiculeId?, excludeOperationId? })` → `ConflictResult[]`. Sans équipe ni véhicule (test de **véracité** : `""` compte comme absent) → `[]` sans requête. Requête : `statut ∉ {Annulée, Terminée, Rapportée}`, `dateHeurePrevue < fin` (pas de borne basse), `$or` sur équipe/véhicule, `_id ≠ excludeOperationId`, **sans tri**. Puis en mémoire : chevauchement strict `debutA < finB && finA > debutB`, durée de l'opération existante `?? 120`, une entrée équipe puis une entrée véhicule par opération candidate.

**Importeurs à recodemoder** (point de départ, à revérifier par grep) :

| Ancien module | Importeur | Symboles |
|---|---|---|
| `@/lib/status-transitions` | `src/app/api/operations/planning/route.ts`, `src/app/api/dashboard/stats/route.ts`, `src/app/(dashboard)/page.tsx` | `computeEffectiveStatus` |
| `@/lib/status-transitions` | `src/app/api/operations/[id]/statut/route.ts` | `canTransition` |
| `@/lib/status-transitions` | `src/components/operations/OperationDetailClient.tsx`, `src/components/terrain/TerrainViewClient.tsx` | `getNextStatuses` |
| `@/lib/status-transitions` | `tests/unit/status-transitions.test.ts` | les trois (un import multi-lignes → deux imports) |
| `@/lib/conflicts` | `src/app/api/operations/route.ts`, `src/app/api/operations/[id]/route.ts`, `src/app/api/recurrences/generate/route.ts`, `tests/unit/conflicts.test.ts` | `checkAssignmentConflicts` |

Aucun test ne pose de `vi.mock`/`vi.spyOn` sur ces deux modules (vérifié par grep) : le piège « alias figé dans `composition.ts` » de R3b ne s'applique pas ici.

**Visibilité** : aujourd'hui dans `src/backend/comptes/http/acteur.ts` (`isWithinClientScope`, `isWithinTeamScope`, `chauffeurWithoutTeamError`, `TEAM_SCOPE_ERROR`, `extractId`), sur le type `AuthSuccess` et des identifiants `unknown`. Également utilisés par `clients-sites` : **ne pas y toucher**. 4a écrit la politique pure équivalente sur `Acteur` (`src/shared/acces/acteur.ts` : `{ id, role, clientId?, equipeId? }`) et des identifiants chaîne ; elle n'est branchée sur aucune route avant 4b/4c.

**Couverture existante** : `tests/unit/conflicts.test.ts` (9 tests, base réelle), `tests/unit/status-transitions.test.ts` (8 tests), `tests/integration/operations-api.test.ts` (409 vérifié seulement par `some(hasConflict)`), `tests/integration/recurrences-api.test.ts` (I7), `tests/integration/{status-workflow,chauffeur-scope,authz-roles,dashboard-planning}.test.ts`. **Trou :** le corps exact du 409 (messages, ordre, identifiant) et le 409/200 du `PUT` ne sont épinglés nulle part → tâche 1.

**Suivi tracé hérité de R3c** (`src/lib/users/scope.ts`, « à traiter avant R4/R5 ou au plus tard R9 ») : **non traité ici**, délibérément — il relève d'un port `comptes` → `clients-sites`/`equipes`, sans rapport avec `operations`, et rien dans R4 n'en dépend. Il reste tracé dans le plan maître.

## Review Focus

Entrées que la spec implique et qui mordraient un utilisateur ; chacune a son test dans la tâche indiquée.

1. **Créneaux bord à bord** (une opération finit à 10 h, la suivante commence à 10 h, dans les deux sens) : pas de conflit — tâche 3, `conflits.test.ts`.
2. **Même opération en conflit sur l'équipe ET le véhicule** : deux entrées, équipe d'abord, même `conflictingOperationId` — tâches 1 et 3.
3. **Opération existante sans `dureeEstimeeMinutes`** (document écrit hors Mongoose, import) : durée 120 min — tâche 3, test de contrat de l'adaptateur + `conflits.test.ts`.
4. **Opération prévue exactement « maintenant »**, ou déjà `Retardée` en base : pas de bascule (comparaison stricte), `Retardée` reste `Retardée` — tâche 2, `statut-effectif.test.ts`.
5. **Chauffeur face à une opération sans équipe, ou dont l'équipe référencée a été supprimée (`null`)** ; compte client sans `clientId` : jamais visible — tâche 4, `visibilite.test.ts` (dont une matrice de parité contre les fonctions héritées).

## File Structure

| Fichier | Responsabilité |
|---|---|
| `tests/integration/operations-conflits-caracterisation.test.ts` (créer) | Filet : corps exact du 409 (`POST`, `PUT`), auto-exclusion du `PUT` |
| `src/shared/operations/transitions.ts` (créer) | Table des transitions, `canTransition`, `getNextStatuses` (front + back) |
| `src/backend/operations/domain/statut-effectif.ts` (+ test) (créer) | `computeEffectiveStatus` à horloge injectable |
| `src/backend/operations/domain/conflits.ts` (+ test) (créer) | Types, fenêtre, chevauchement, `detecterConflits` (pur) |
| `src/backend/operations/domain/ports.ts` (créer) | Port `Affectations` |
| `src/backend/operations/domain/visibilite.ts` (+ test) (créer) | Politique de visibilité sur `Acteur` |
| `src/backend/operations/application/verifier-conflits.ts` (+ test) (créer) | Cas d'usage : port → règle pure |
| `src/backend/operations/infrastructure/en-memoire/affectations.en-memoire.ts` (créer) | Faux du port pour les tests de cas d'usage |
| `src/backend/operations/infrastructure/mongoose/affectations.mongoose.ts` (+ test de contrat) (créer) | Requête des opérations candidates |
| `src/backend/operations/composition.ts`, `index.ts` (créer) | Assemblage ; API publique |
| `tests/architecture/regles-de-dependance.test.ts` (modifier) | `operations` ajouté à `domainesBackendMigres` |
| `src/lib/status-transitions.ts`, `src/lib/conflicts.ts` (supprimer) | — |

---

### Task 1 : Filet — corps exact des conflits d'affectation

**Files:**
- Create: `tests/integration/operations-conflits-caracterisation.test.ts`

**Interfaces:**
- Consomme : `POST` de `@/app/api/operations/route`, `PUT` de `@/app/api/operations/[id]/route` (code actuel, inchangé).
- Produit : un oracle qui doit rester vert, **sans modification**, à travers les tâches 2 à 4.

- [ ] **Step 1 : Créer la branche**

```bash
git checkout main && git checkout -b refactor/r4a-operations-domaine
```

- [ ] **Step 2 : Écrire le test de caractérisation**

```ts
// tests/integration/operations-conflits-caracterisation.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { POST as createOperation } from "@/app/api/operations/route";
import { PUT as updateOperation } from "@/app/api/operations/[id]/route";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Site } from "@/backend/clients-sites/infrastructure/mongoose/site.model";
import { Equipe } from "@/backend/equipes/infrastructure/mongoose/equipe.model";
import { Vehicule } from "@/backend/vehicules/infrastructure/mongoose/vehicule.model";

const MESSAGE_EQUIPE = "L'équipe est déjà affectée à une opération sur ce créneau";
const MESSAGE_VEHICULE = "Le véhicule est déjà affecté à une opération sur ce créneau";

describe("Caractérisation — conflits d'affectation (corps exact du 409)", () => {
  let clientId: string;
  let siteId: string;
  let equipeId: string;
  let vehiculeId: string;

  const corps = (surcharge: Record<string, unknown> = {}) => ({
    clientId,
    siteId,
    natureIntervention: "Collecte",
    dateHeurePrevue: "2026-11-01T10:00:00Z",
    dureeEstimeeMinutes: 120,
    equipeId,
    vehiculeId,
    ...surcharge,
  });

  const creer = (surcharge: Record<string, unknown> = {}) =>
    createOperation(
      new NextRequest("http://localhost:3000/api/operations", {
        method: "POST",
        body: JSON.stringify(corps(surcharge)),
      })
    );

  const modifier = (id: string, surcharge: Record<string, unknown> = {}) =>
    updateOperation(
      new NextRequest(`http://localhost:3000/api/operations/${id}`, {
        method: "PUT",
        body: JSON.stringify(corps(surcharge)),
      }),
      { params: Promise.resolve({ id }) }
    );

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.mocked(nextAuth.getServerSession).mockResolvedValue({
      user: { id: "507f1f77bcf86cd799439011", nom: "Admin Ops", email: "admin@srh.ci", role: "admin" },
    } as never);

    const client = await Client.create({ nom: "Client Conflits" });
    const site = await Site.create({ clientId: client._id, nom: "Site Conflits" });
    const equipe = await Equipe.create({ nom: "Équipe Conflits" });
    const vehicule = await Vehicule.create({ identification: "V-CONF-01" });
    clientId = String(client._id);
    siteId = String(site._id);
    equipeId = String(equipe._id);
    vehiculeId = String(vehicule._id);
  });

  it("POST : équipe et véhicule occupés → 409, deux entrées, équipe avant véhicule", async () => {
    const premiere = await (await creer()).json();

    const res = await creer({ dateHeurePrevue: "2026-11-01T11:00:00Z" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Conflit d'affectation",
      conflicts: [
        { hasConflict: true, message: MESSAGE_EQUIPE, conflictingOperationId: premiere._id },
        { hasConflict: true, message: MESSAGE_VEHICULE, conflictingOperationId: premiere._id },
      ],
    });
  });

  it("POST : seul le véhicule est occupé → 409, une seule entrée véhicule", async () => {
    const premiere = await (await creer()).json();
    const autreEquipe = await Equipe.create({ nom: "Autre équipe" });

    const res = await creer({ dateHeurePrevue: "2026-11-01T11:00:00Z", equipeId: String(autreEquipe._id) });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Conflit d'affectation",
      conflicts: [{ hasConflict: true, message: MESSAGE_VEHICULE, conflictingOperationId: premiere._id }],
    });
  });

  it("POST : créneau bord à bord (début = fin de l'existante) → 201", async () => {
    await creer();
    const res = await creer({ dateHeurePrevue: "2026-11-01T12:00:00Z" });
    expect(res.status).toBe(201);
  });

  it("PUT : une opération ne se bloque pas elle-même → 200", async () => {
    const premiere = await (await creer()).json();
    const res = await modifier(premiere._id, { dateHeurePrevue: "2026-11-01T10:30:00Z" });
    expect(res.status).toBe(200);
  });

  it("PUT : déplacer une opération sur le créneau d'une autre → 409, corps exact", async () => {
    const premiere = await (await creer()).json();
    const seconde = await (await creer({ dateHeurePrevue: "2026-11-01T14:00:00Z" })).json();

    const res = await modifier(seconde._id, { dateHeurePrevue: "2026-11-01T11:00:00Z" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Conflit d'affectation",
      conflicts: [
        { hasConflict: true, message: MESSAGE_EQUIPE, conflictingOperationId: premiere._id },
        { hasConflict: true, message: MESSAGE_VEHICULE, conflictingOperationId: premiere._id },
      ],
    });
  });
});
```

- [ ] **Step 3 : Vérifier qu'il passe sur le code actuel**

Run : `npx vitest run tests/integration/operations-conflits-caracterisation.test.ts`
Expected : 5 tests PASS. Si l'un échoue, **le test est faux, pas le code** : corriger le test pour décrire le comportement réel, ne jamais toucher aux routes.

- [ ] **Step 4 : Vérification et commit**

Run : `npx tsc --noEmit && npm run lint && npx vitest run` → vert, **895 tests**.

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!data' ':!package.json'
git status
git commit -m "test(operations): caractérisation du corps exact des conflits d'affectation (POST, PUT)"
```

---

### Task 2 : Statuts — transitions partagées et statut effectif

**Files:**
- Create: `src/shared/operations/transitions.ts`, `src/backend/operations/domain/statut-effectif.ts`, `src/backend/operations/domain/statut-effectif.test.ts`, `src/backend/operations/index.ts`
- Modify: `tests/architecture/regles-de-dependance.test.ts` (liste `domainesBackendMigres`), les 7 importeurs de `@/lib/status-transitions` (table des faits vérifiés)
- Delete: `src/lib/status-transitions.ts`

**Interfaces:**
- Produit :
  ```ts
  // @/shared/operations/transitions
  export function canTransition(from: OperationStatus, to: OperationStatus): boolean;
  export function getNextStatuses(current: OperationStatus): OperationStatus[];
  // @/backend/operations (index.ts) ← ./domain/statut-effectif
  export function computeEffectiveStatus(statut: OperationStatus, dateHeurePrevue: Date, maintenant?: Date): OperationStatus;
  ```
  Le troisième paramètre est **optionnel** (`new Date()` par défaut) : les appelants hérités et `tests/unit/status-transitions.test.ts` restent inchangés ; les cas d'usage de 4b passeront `horloge.maintenant()`.

- [ ] **Step 1 : Écrire le test du statut effectif (échec attendu)**

```ts
// src/backend/operations/domain/statut-effectif.test.ts
import { describe, it, expect } from "vitest";
import { computeEffectiveStatus } from "./statut-effectif";

const MAINTENANT = new Date("2026-10-03T12:00:00.000Z");
const AVANT = new Date("2026-10-03T11:59:59.999Z");
const APRES = new Date("2026-10-03T12:00:00.001Z");

describe("computeEffectiveStatus (horloge injectée)", () => {
  it.each(["Planifiée", "Affectée", "En route", "En cours"] as const)(
    "%s dont la date est dépassée devient Retardée",
    (statut) => {
      expect(computeEffectiveStatus(statut, AVANT, MAINTENANT)).toBe("Retardée");
    }
  );

  it("une opération prévue exactement maintenant n'est pas en retard (comparaison stricte)", () => {
    expect(computeEffectiveStatus("Planifiée", new Date(MAINTENANT), MAINTENANT)).toBe("Planifiée");
  });

  it("une opération à venir garde son statut", () => {
    expect(computeEffectiveStatus("Affectée", APRES, MAINTENANT)).toBe("Affectée");
  });

  it("Retardée reste Retardée, que la date soit passée ou future", () => {
    expect(computeEffectiveStatus("Retardée", AVANT, MAINTENANT)).toBe("Retardée");
    expect(computeEffectiveStatus("Retardée", APRES, MAINTENANT)).toBe("Retardée");
  });

  it.each(["Terminée", "Rapportée", "Annulée"] as const)("%s (terminal) ne bascule jamais", (statut) => {
    expect(computeEffectiveStatus(statut, AVANT, MAINTENANT)).toBe(statut);
  });

  it("sans horloge fournie, utilise l'instant présent", () => {
    expect(computeEffectiveStatus("Planifiée", new Date(Date.now() - 3_600_000))).toBe("Retardée");
    expect(computeEffectiveStatus("Planifiée", new Date(Date.now() + 3_600_000))).toBe("Planifiée");
  });
});
```

Run : `npx vitest run src/backend/operations/domain/statut-effectif.test.ts` → FAIL (module introuvable).

- [ ] **Step 2 : Écrire les deux modules**

```ts
// src/shared/operations/transitions.ts
import type { OperationStatus } from "@/shared/operations/statuts";

const ALLOWED_TRANSITIONS: Record<OperationStatus, OperationStatus[]> = {
  Planifiée: ["Affectée", "Annulée", "Retardée"],
  Affectée: ["En route", "Annulée", "Retardée"],
  "En route": ["En cours", "Retardée", "Annulée"],
  "En cours": ["Terminée", "Retardée", "Annulée"],
  Terminée: ["Rapportée"],
  Rapportée: [],
  Retardée: ["En route", "En cours", "Terminée", "Annulée"],
  Annulée: [],
};

export function canTransition(
  from: OperationStatus,
  to: OperationStatus
): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getNextStatuses(current: OperationStatus): OperationStatus[] {
  return ALLOWED_TRANSITIONS[current] ?? [];
}
```

```ts
// src/backend/operations/domain/statut-effectif.ts
import { TERMINAL_STATUSES, type OperationStatus } from "@/shared/operations/statuts";

/**
 * Statut à afficher : une opération non terminale dont la date prévue est dépassée
 * est présentée « Retardée » sans que la base soit modifiée (calcul à l'affichage).
 */
export function computeEffectiveStatus(
  statut: OperationStatus,
  dateHeurePrevue: Date,
  maintenant: Date = new Date()
): OperationStatus {
  if (TERMINAL_STATUSES.includes(statut)) return statut;
  if (dateHeurePrevue < maintenant && statut !== "Retardée") {
    return "Retardée";
  }
  return statut;
}
```

```ts
// src/backend/operations/index.ts
// API publique du domaine `operations` pour les autres domaines et pour `src/app`.
export { computeEffectiveStatus } from "./domain/statut-effectif";
```

Run : `npx vitest run src/backend/operations/domain/statut-effectif.test.ts` → PASS (11 tests).

- [ ] **Step 3 : Codemod des importeurs**

Écrire la carte **hors du dépôt** puis lancer le script de redistribution :

```bash
cat > "${TMPDIR:-/tmp}/carte-r4a-statuts.json" <<'JSON'
{
  "de": "@/lib/status-transitions",
  "carte": {
    "canTransition": "@/shared/operations/transitions",
    "getNextStatuses": "@/shared/operations/transitions",
    "computeEffectiveStatus": "@/backend/operations"
  }
}
JSON
node scripts/dev/redistribuer-imports.mjs "${TMPDIR:-/tmp}/carte-r4a-statuts.json"
git diff --stat
grep -rn "status-transitions" src tests scripts
```

Expected : 7 fichiers modifiés (ceux de la table). Le `grep` ne doit plus trouver que `src/lib/status-transitions.ts` lui-même et le **titre** `describe("Status Transition & Logic (lib/status-transitions.ts)", …)` de `tests/unit/status-transitions.test.ts` (une chaîne, à laisser telle quelle). Si le script n'a pas su réécrire l'import multi-lignes de ce test, le remplacer à la main par exactement :

```ts
import { canTransition, getNextStatuses } from "@/shared/operations/transitions";
import { computeEffectiveStatus } from "@/backend/operations";
```

- [ ] **Step 4 : Supprimer l'ancien module, déclarer le domaine**

```bash
git rm src/lib/status-transitions.ts
```

Dans `tests/architecture/regles-de-dependance.test.ts`, remplacer la ligne `domainesBackendMigres` par :

```ts
  // `operations` : déclaré dès R4a pour que les règles s'appliquent au nouveau code ;
  // ses routes restent héritées (src/app/api/operations) jusqu'à 4b-4d.
  domainesBackendMigres: ["equipes", "vehicules", "equipements", "clients-sites", "comptes", "operations"],
```

- [ ] **Step 5 : Vérification et commit**

Run : `npx tsc --noEmit && npm run lint && npx vitest run` → vert, **906 tests**. `git diff main --stat -- tests/unit tests/integration` : hors le fichier créé en tâche 1, seul `tests/unit/status-transitions.test.ts` change, et seulement ses imports.

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!data' ':!package.json'
git status
git commit -m "refactor(operations): transitions de statut vers shared, statut effectif vers le domaine (horloge injectable)"
```

---

### Task 3 : Conflits — règle pure, port `Affectations`, adaptateur, cas d'usage

**Files:**
- Create: `src/backend/operations/domain/conflits.ts` (+ `conflits.test.ts`), `src/backend/operations/domain/ports.ts`, `src/backend/operations/infrastructure/en-memoire/affectations.en-memoire.ts`, `src/backend/operations/application/verifier-conflits.ts` (+ `verifier-conflits.test.ts`), `src/backend/operations/infrastructure/mongoose/affectations.mongoose.ts` (+ `affectations.mongoose.test.ts`), `src/backend/operations/composition.ts`
- Modify: `src/backend/operations/index.ts`, les 4 importeurs de `@/lib/conflicts`
- Delete: `src/lib/conflicts.ts`

**Interfaces:**
- Consomme : `connectDB` de `@/backend/platform/base-de-donnees/connexion` ; le modèle `Operation` de `@/models/Operation` (héritage, toléré dans `infrastructure/` jusqu'à 4b).
- Produit :
  ```ts
  // domain/conflits.ts
  export const DUREE_PAR_DEFAUT_MINUTES = 120;
  export const STATUTS_SANS_CONFLIT: OperationStatus[];           // Annulée, Terminée, Rapportée
  export interface ConflictResult { hasConflict: boolean; message?: string; conflictingOperationId?: string }
  export interface DemandeAffectation { dateHeurePrevue: Date; dureeEstimeeMinutes?: number; equipeId?: string; vehiculeId?: string; excludeOperationId?: string }
  export interface AffectationExistante { operationId: string; dateHeurePrevue: Date; dureeEstimeeMinutes?: number | null; equipeId?: string; vehiculeId?: string }
  export function finPrevue(debut: Date, dureeMinutes: number): Date;
  export function fenetreDemandee(demande: DemandeAffectation): { debut: Date; fin: Date };
  export function seChevauchent(debutA: Date, finA: Date, debutB: Date, finB: Date): boolean;
  export function detecterConflits(demande: DemandeAffectation, existantes: AffectationExistante[]): ConflictResult[];
  // domain/ports.ts
  export interface CritereAffectations { debutAvant: Date; equipeId?: string; vehiculeId?: string; exclureOperationId?: string }
  export interface Affectations { candidates(critere: CritereAffectations): Promise<AffectationExistante[]> }
  // application/verifier-conflits.ts
  export function creerVerificationConflits(deps: { affectations: Affectations }): (demande: DemandeAffectation) => Promise<ConflictResult[]>;
  // index.ts (← composition.ts)
  export const checkAssignmentConflicts: (demande: DemandeAffectation) => Promise<ConflictResult[]>;
  ```
  `finPrevue` et `DUREE_PAR_DEFAUT_MINUTES` seront réutilisés par le planning en 4b.

- [ ] **Step 1 : Test de la règle pure (échec attendu)**

```ts
// src/backend/operations/domain/conflits.test.ts
import { describe, it, expect } from "vitest";
import {
  detecterConflits,
  fenetreDemandee,
  finPrevue,
  seChevauchent,
  type AffectationExistante,
} from "./conflits";

const MESSAGE_EQUIPE = "L'équipe est déjà affectée à une opération sur ce créneau";
const MESSAGE_VEHICULE = "Le véhicule est déjà affecté à une opération sur ce créneau";
const h = (heure: string) => new Date(`2026-10-01T${heure}:00Z`);

const existante = (surcharge: Partial<AffectationExistante> = {}): AffectationExistante => ({
  operationId: "op-1",
  dateHeurePrevue: h("08:00"),
  dureeEstimeeMinutes: 120,
  equipeId: "equipe-a",
  vehiculeId: "vehicule-a",
  ...surcharge,
});

describe("fenêtre et chevauchement", () => {
  it("finPrevue ajoute la durée en minutes", () => {
    expect(finPrevue(h("08:00"), 90)).toEqual(h("09:30"));
  });

  it("fenetreDemandee applique 120 minutes quand la durée est absente", () => {
    expect(fenetreDemandee({ dateHeurePrevue: h("08:00") })).toEqual({ debut: h("08:00"), fin: h("10:00") });
    expect(fenetreDemandee({ dateHeurePrevue: h("08:00"), dureeEstimeeMinutes: 30 }).fin).toEqual(h("08:30"));
  });

  it("deux créneaux bord à bord ne se chevauchent pas, dans les deux sens", () => {
    expect(seChevauchent(h("08:00"), h("10:00"), h("10:00"), h("12:00"))).toBe(false);
    expect(seChevauchent(h("10:00"), h("12:00"), h("08:00"), h("10:00"))).toBe(false);
    expect(seChevauchent(h("08:00"), h("10:00"), h("09:59"), h("12:00"))).toBe(true);
  });
});

describe("detecterConflits", () => {
  it("même opération sur l'équipe et le véhicule : deux entrées, équipe d'abord", () => {
    const conflits = detecterConflits(
      { dateHeurePrevue: h("09:00"), dureeEstimeeMinutes: 120, equipeId: "equipe-a", vehiculeId: "vehicule-a" },
      [existante()]
    );
    expect(conflits).toEqual([
      { hasConflict: true, message: MESSAGE_EQUIPE, conflictingOperationId: "op-1" },
      { hasConflict: true, message: MESSAGE_VEHICULE, conflictingOperationId: "op-1" },
    ]);
  });

  it("ne signale que la ressource réellement partagée", () => {
    const conflits = detecterConflits(
      { dateHeurePrevue: h("09:00"), equipeId: "equipe-b", vehiculeId: "vehicule-a" },
      [existante()]
    );
    expect(conflits).toEqual([{ hasConflict: true, message: MESSAGE_VEHICULE, conflictingOperationId: "op-1" }]);
  });

  it("suit l'ordre des opérations candidates", () => {
    const conflits = detecterConflits({ dateHeurePrevue: h("09:00"), equipeId: "equipe-a" }, [
      existante({ operationId: "op-2", vehiculeId: undefined }),
      existante({ operationId: "op-1", vehiculeId: undefined }),
    ]);
    expect(conflits.map((c) => c.conflictingOperationId)).toEqual(["op-2", "op-1"]);
  });

  it("ignore une candidate qui ne chevauche pas (bord à bord, avant ou après)", () => {
    expect(detecterConflits({ dateHeurePrevue: h("10:00"), equipeId: "equipe-a" }, [existante()])).toEqual([]);
    expect(
      detecterConflits({ dateHeurePrevue: h("06:00"), dureeEstimeeMinutes: 120, equipeId: "equipe-a" }, [existante()])
    ).toEqual([]);
  });

  it("une candidate sans durée (absente ou null) dure 120 minutes", () => {
    for (const dureeEstimeeMinutes of [undefined, null]) {
      const candidate = existante({ dureeEstimeeMinutes });
      expect(detecterConflits({ dateHeurePrevue: h("09:59"), equipeId: "equipe-a" }, [candidate])).toHaveLength(1);
      expect(detecterConflits({ dateHeurePrevue: h("10:00"), equipeId: "equipe-a" }, [candidate])).toEqual([]);
    }
  });

  it("une opération longue démarrée bien avant bloque encore le créneau", () => {
    const conflits = detecterConflits(
      { dateHeurePrevue: h("12:30"), dureeEstimeeMinutes: 60, equipeId: "equipe-a" },
      [existante({ dureeEstimeeMinutes: 300 })]
    );
    expect(conflits).toHaveLength(1);
  });

  it("une ressource vide n'est jamais en conflit", () => {
    expect(
      detecterConflits({ dateHeurePrevue: h("09:00"), equipeId: "", vehiculeId: undefined }, [
        existante({ equipeId: undefined, vehiculeId: undefined }),
      ])
    ).toEqual([]);
  });
});
```

Run : `npx vitest run src/backend/operations/domain/conflits.test.ts` → FAIL (module introuvable).

- [ ] **Step 2 : Règle pure et port**

```ts
// src/backend/operations/domain/conflits.ts
import type { OperationStatus } from "@/shared/operations/statuts";

export const DUREE_PAR_DEFAUT_MINUTES = 120;

/** Une opération dans l'un de ces statuts ne retient plus ni équipe ni véhicule. */
export const STATUTS_SANS_CONFLIT: OperationStatus[] = ["Annulée", "Terminée", "Rapportée"];

/** Forme renvoyée telle quelle dans le corps du 409 : ne pas renommer les champs. */
export interface ConflictResult {
  hasConflict: boolean;
  message?: string;
  conflictingOperationId?: string;
}

export interface DemandeAffectation {
  dateHeurePrevue: Date;
  dureeEstimeeMinutes?: number;
  equipeId?: string;
  vehiculeId?: string;
  excludeOperationId?: string;
}

/** Ce qu'il faut savoir d'une opération existante pour tester un chevauchement. */
export interface AffectationExistante {
  operationId: string;
  dateHeurePrevue: Date;
  dureeEstimeeMinutes?: number | null;
  equipeId?: string;
  vehiculeId?: string;
}

export function finPrevue(debut: Date, dureeMinutes: number): Date {
  return new Date(debut.getTime() + dureeMinutes * 60 * 1000);
}

export function fenetreDemandee(demande: DemandeAffectation): { debut: Date; fin: Date } {
  const { dateHeurePrevue, dureeEstimeeMinutes = DUREE_PAR_DEFAUT_MINUTES } = demande;
  return { debut: dateHeurePrevue, fin: finPrevue(dateHeurePrevue, dureeEstimeeMinutes) };
}

export function seChevauchent(debutA: Date, finA: Date, debutB: Date, finB: Date): boolean {
  return debutA < finB && finA > debutB;
}

/**
 * Une entrée par ressource partagée et par opération candidate qui chevauche le créneau
 * demandé, dans l'ordre des candidates ; pour une même opération, l'équipe avant le véhicule.
 */
export function detecterConflits(
  demande: DemandeAffectation,
  existantes: AffectationExistante[]
): ConflictResult[] {
  const { equipeId, vehiculeId } = demande;
  const { debut, fin } = fenetreDemandee(demande);
  const conflits: ConflictResult[] = [];

  for (const existante of existantes) {
    const debutExistante = existante.dateHeurePrevue;
    const finExistante = finPrevue(
      debutExistante,
      existante.dureeEstimeeMinutes ?? DUREE_PAR_DEFAUT_MINUTES
    );

    if (!seChevauchent(debut, fin, debutExistante, finExistante)) continue;

    if (equipeId && existante.equipeId === equipeId) {
      conflits.push({
        hasConflict: true,
        message: "L'équipe est déjà affectée à une opération sur ce créneau",
        conflictingOperationId: existante.operationId,
      });
    }
    if (vehiculeId && existante.vehiculeId === vehiculeId) {
      conflits.push({
        hasConflict: true,
        message: "Le véhicule est déjà affecté à une opération sur ce créneau",
        conflictingOperationId: existante.operationId,
      });
    }
  }

  return conflits;
}
```

```ts
// src/backend/operations/domain/ports.ts
import type { AffectationExistante } from "./conflits";

export interface CritereAffectations {
  /** Borne haute exclusive : seules les opérations qui démarrent avant cet instant. */
  debutAvant: Date;
  equipeId?: string;
  vehiculeId?: string;
  exclureOperationId?: string;
}

export interface Affectations {
  /**
   * Opérations qui retiennent encore une ressource (hors `STATUTS_SANS_CONFLIT`), affectées à
   * l'équipe OU au véhicule demandés, démarrant avant `debutAvant`. Pas de borne basse : une
   * opération longue démarrée bien avant peut encore chevaucher (le chevauchement exact est
   * testé par `detecterConflits`). Sans équipe ni véhicule : aucune candidate.
   */
  candidates(critere: CritereAffectations): Promise<AffectationExistante[]>;
}
```

Run : `npx vitest run src/backend/operations/domain/conflits.test.ts` → PASS (10 tests).

- [ ] **Step 3 : Faux en mémoire et test du cas d'usage (échec attendu)**

```ts
// src/backend/operations/infrastructure/en-memoire/affectations.en-memoire.ts
import type { OperationStatus } from "@/shared/operations/statuts";
import { STATUTS_SANS_CONFLIT, type AffectationExistante } from "../../domain/conflits";
import type { Affectations, CritereAffectations } from "../../domain/ports";

export type AffectationEnregistree = AffectationExistante & { statut: OperationStatus };

export class AffectationsEnMemoire implements Affectations {
  /** Critères reçus, dans l'ordre des appels (pour les assertions des tests). */
  readonly appels: CritereAffectations[] = [];

  constructor(private readonly operations: AffectationEnregistree[] = []) {}

  async candidates(critere: CritereAffectations): Promise<AffectationExistante[]> {
    this.appels.push(critere);
    const { debutAvant, equipeId, vehiculeId, exclureOperationId } = critere;
    if (!equipeId && !vehiculeId) return [];
    return this.operations
      .filter((op) => !STATUTS_SANS_CONFLIT.includes(op.statut))
      .filter((op) => op.dateHeurePrevue < debutAvant)
      .filter((op) => (equipeId && op.equipeId === equipeId) || (vehiculeId && op.vehiculeId === vehiculeId))
      .filter((op) => op.operationId !== exclureOperationId)
      .map(({ operationId, dateHeurePrevue, dureeEstimeeMinutes, equipeId: equipe, vehiculeId: vehicule }) => ({
        operationId,
        dateHeurePrevue,
        dureeEstimeeMinutes,
        equipeId: equipe,
        vehiculeId: vehicule,
      }));
  }
}
```

```ts
// src/backend/operations/application/verifier-conflits.test.ts
import { describe, it, expect } from "vitest";
import { creerVerificationConflits } from "./verifier-conflits";
import {
  AffectationsEnMemoire,
  type AffectationEnregistree,
} from "../infrastructure/en-memoire/affectations.en-memoire";

const h = (heure: string) => new Date(`2026-10-01T${heure}:00Z`);

const enregistree = (surcharge: Partial<AffectationEnregistree> = {}): AffectationEnregistree => ({
  operationId: "op-1",
  dateHeurePrevue: h("08:00"),
  dureeEstimeeMinutes: 120,
  equipeId: "equipe-a",
  vehiculeId: "vehicule-a",
  statut: "Affectée",
  ...surcharge,
});

describe("vérification des conflits d'affectation (cas d'usage)", () => {
  it("sans équipe ni véhicule : aucun conflit, et le port n'est pas interrogé", async () => {
    const affectations = new AffectationsEnMemoire([enregistree()]);
    const verifier = creerVerificationConflits({ affectations });

    expect(await verifier({ dateHeurePrevue: h("09:00") })).toEqual([]);
    expect(await verifier({ dateHeurePrevue: h("09:00"), equipeId: "", vehiculeId: "" })).toEqual([]);
    expect(affectations.appels).toHaveLength(0);
  });

  it("interroge le port avec la fin du créneau demandé et l'opération à exclure", async () => {
    const affectations = new AffectationsEnMemoire();
    const verifier = creerVerificationConflits({ affectations });

    await verifier({
      dateHeurePrevue: h("09:00"),
      dureeEstimeeMinutes: 60,
      equipeId: "equipe-a",
      excludeOperationId: "op-9",
    });

    expect(affectations.appels).toEqual([
      { debutAvant: h("10:00"), equipeId: "equipe-a", vehiculeId: undefined, exclureOperationId: "op-9" },
    ]);
  });

  it("durée absente : la borne est à 120 minutes", async () => {
    const affectations = new AffectationsEnMemoire();
    await creerVerificationConflits({ affectations })({ dateHeurePrevue: h("09:00"), vehiculeId: "vehicule-a" });
    expect(affectations.appels[0].debutAvant).toEqual(h("11:00"));
  });

  it("signale l'équipe et le véhicule occupés", async () => {
    const verifier = creerVerificationConflits({ affectations: new AffectationsEnMemoire([enregistree()]) });
    const conflits = await verifier({ dateHeurePrevue: h("09:00"), equipeId: "equipe-a", vehiculeId: "vehicule-a" });
    expect(conflits.map((c) => c.message)).toEqual([
      "L'équipe est déjà affectée à une opération sur ce créneau",
      "Le véhicule est déjà affecté à une opération sur ce créneau",
    ]);
  });

  it.each(["Annulée", "Terminée", "Rapportée"] as const)("une opération %s ne bloque rien", async (statut) => {
    const verifier = creerVerificationConflits({ affectations: new AffectationsEnMemoire([enregistree({ statut })]) });
    expect(await verifier({ dateHeurePrevue: h("09:00"), equipeId: "equipe-a" })).toEqual([]);
  });

  it("une opération ne se bloque pas elle-même (modification)", async () => {
    const verifier = creerVerificationConflits({ affectations: new AffectationsEnMemoire([enregistree()]) });
    expect(
      await verifier({ dateHeurePrevue: h("08:30"), equipeId: "equipe-a", excludeOperationId: "op-1" })
    ).toEqual([]);
  });
});
```

Run : `npx vitest run src/backend/operations/application` → FAIL (module `./verifier-conflits` introuvable).

- [ ] **Step 4 : Cas d'usage**

```ts
// src/backend/operations/application/verifier-conflits.ts
import {
  detecterConflits,
  fenetreDemandee,
  type ConflictResult,
  type DemandeAffectation,
} from "../domain/conflits";
import type { Affectations } from "../domain/ports";

export function creerVerificationConflits(deps: { affectations: Affectations }) {
  return async function checkAssignmentConflicts(demande: DemandeAffectation): Promise<ConflictResult[]> {
    const { equipeId, vehiculeId, excludeOperationId } = demande;
    if (!equipeId && !vehiculeId) return [];

    const existantes = await deps.affectations.candidates({
      debutAvant: fenetreDemandee(demande).fin,
      equipeId,
      vehiculeId,
      exclureOperationId: excludeOperationId,
    });

    return detecterConflits(demande, existantes);
  };
}
```

Run : `npx vitest run src/backend/operations/application` → PASS (8 tests).

- [ ] **Step 5 : Test de contrat de l'adaptateur Mongoose (échec attendu)**

```ts
// src/backend/operations/infrastructure/mongoose/affectations.mongoose.test.ts
import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { Operation } from "@/models/Operation";
import { AffectationsMongoose } from "./affectations.mongoose";

const id = () => new mongoose.Types.ObjectId();
const h = (heure: string) => new Date(`2026-10-01T${heure}:00Z`);

async function creer(surcharge: Record<string, unknown> = {}) {
  const doc = await Operation.create({
    clientId: id(),
    siteId: id(),
    natureIntervention: "Collecte",
    dateHeurePrevue: h("08:00"),
    dureeEstimeeMinutes: 90,
    statut: "Affectée",
    ...surcharge,
  });
  return String(doc._id);
}

describe("AffectationsMongoose (contrat)", () => {
  const affectations = new AffectationsMongoose();

  it("renvoie l'opération de l'équipe, avec des identifiants en chaînes", async () => {
    const equipeId = id();
    const vehiculeId = id();
    const operationId = await creer({ equipeId, vehiculeId });

    const candidates = await affectations.candidates({ debutAvant: h("12:00"), equipeId: String(equipeId) });

    expect(candidates).toEqual([
      {
        operationId,
        dateHeurePrevue: h("08:00"),
        dureeEstimeeMinutes: 90,
        equipeId: String(equipeId),
        vehiculeId: String(vehiculeId),
      },
    ]);
  });

  it("équipe OU véhicule : renvoie les deux opérations", async () => {
    const equipeId = id();
    const vehiculeId = id();
    const parEquipe = await creer({ equipeId });
    const parVehicule = await creer({ vehiculeId });
    await creer({ equipeId: id(), vehiculeId: id() });

    const candidates = await affectations.candidates({
      debutAvant: h("12:00"),
      equipeId: String(equipeId),
      vehiculeId: String(vehiculeId),
    });

    expect(candidates.map((c) => c.operationId).sort()).toEqual([parEquipe, parVehicule].sort());
  });

  it.each(["Annulée", "Terminée", "Rapportée"])("écarte une opération %s", async (statut) => {
    const equipeId = id();
    await creer({ equipeId, statut });
    expect(await affectations.candidates({ debutAvant: h("12:00"), equipeId: String(equipeId) })).toEqual([]);
  });

  it("borne haute exclusive : une opération qui démarre à `debutAvant` est écartée", async () => {
    const equipeId = id();
    await creer({ equipeId, dateHeurePrevue: h("12:00") });
    const juste = await creer({ equipeId, dateHeurePrevue: h("11:59") });

    const candidates = await affectations.candidates({ debutAvant: h("12:00"), equipeId: String(equipeId) });

    expect(candidates.map((c) => c.operationId)).toEqual([juste]);
  });

  it("pas de borne basse : une opération démarrée bien avant reste candidate", async () => {
    const equipeId = id();
    const ancienne = await creer({ equipeId, dateHeurePrevue: new Date("2026-09-01T08:00:00Z") });
    const candidates = await affectations.candidates({ debutAvant: h("12:00"), equipeId: String(equipeId) });
    expect(candidates.map((c) => c.operationId)).toEqual([ancienne]);
  });

  it("écarte l'opération à exclure", async () => {
    const equipeId = id();
    const operationId = await creer({ equipeId });
    expect(
      await affectations.candidates({
        debutAvant: h("12:00"),
        equipeId: String(equipeId),
        exclureOperationId: operationId,
      })
    ).toEqual([]);
  });

  it("document écrit hors Mongoose, sans durée ni véhicule : champs absents, pas de valeur inventée", async () => {
    const equipeId = id();
    const { insertedId } = await Operation.collection.insertOne({
      clientId: id(),
      siteId: id(),
      natureIntervention: "Import",
      dateHeurePrevue: h("08:00"),
      equipeId,
      statut: "Planifiée",
    });

    const candidates = await affectations.candidates({ debutAvant: h("12:00"), equipeId: String(equipeId) });

    expect(candidates).toEqual([
      {
        operationId: String(insertedId),
        dateHeurePrevue: h("08:00"),
        dureeEstimeeMinutes: undefined,
        equipeId: String(equipeId),
        vehiculeId: undefined,
      },
    ]);
  });

  it("sans équipe ni véhicule : aucune candidate (pas de `$or` vide envoyé à Mongo)", async () => {
    await creer({ equipeId: id() });
    expect(await affectations.candidates({ debutAvant: h("12:00") })).toEqual([]);
  });
});
```

Run : `npx vitest run src/backend/operations/infrastructure` → FAIL (module introuvable).

- [ ] **Step 6 : Adaptateur Mongoose**

```ts
// src/backend/operations/infrastructure/mongoose/affectations.mongoose.ts
import mongoose from "mongoose";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
// Modèle encore hérité : il rejoindra `./operation.model` au sous-jalon 4b.
import { Operation } from "@/models/Operation";
import { STATUTS_SANS_CONFLIT, type AffectationExistante } from "../../domain/conflits";
import type { Affectations, CritereAffectations } from "../../domain/ports";

interface DocumentAffectation {
  _id: unknown;
  dateHeurePrevue: Date;
  dureeEstimeeMinutes?: number | null;
  equipeId?: { toString(): string } | null;
  vehiculeId?: { toString(): string } | null;
}

export class AffectationsMongoose implements Affectations {
  async candidates(critere: CritereAffectations): Promise<AffectationExistante[]> {
    const { debutAvant, equipeId, vehiculeId, exclureOperationId } = critere;

    const ressources: Record<string, unknown>[] = [];
    if (equipeId) {
      ressources.push({ equipeId: new mongoose.Types.ObjectId(equipeId) });
    }
    if (vehiculeId) {
      ressources.push({ vehiculeId: new mongoose.Types.ObjectId(vehiculeId) });
    }
    if (ressources.length === 0) return [];

    const filtre: Record<string, unknown> = {
      statut: { $nin: STATUTS_SANS_CONFLIT },
      dateHeurePrevue: { $lt: debutAvant },
      $or: ressources,
    };
    if (exclureOperationId) {
      filtre._id = { $ne: new mongoose.Types.ObjectId(exclureOperationId) };
    }

    await connectDB();
    const documents = (await Operation.find(filtre).lean()) as unknown as DocumentAffectation[];

    return documents.map((doc) => ({
      operationId: String(doc._id),
      dateHeurePrevue: new Date(doc.dateHeurePrevue),
      dureeEstimeeMinutes: doc.dureeEstimeeMinutes,
      equipeId: doc.equipeId?.toString(),
      vehiculeId: doc.vehiculeId?.toString(),
    }));
  }
}
```

Run : `npx vitest run src/backend/operations/infrastructure` → PASS (10 tests). Si le test « document écrit hors Mongoose » échoue parce que `toEqual` distingue une clé absente d'une clé `undefined`, c'est le **test** qu'on n'assouplit pas : `toEqual` traite les deux comme égaux ; un échec signale donc une vraie différence de valeur, à corriger dans l'adaptateur.

- [ ] **Step 7 : Composition et API publique**

```ts
// src/backend/operations/composition.ts
import { creerVerificationConflits } from "./application/verifier-conflits";
import { AffectationsMongoose } from "./infrastructure/mongoose/affectations.mongoose";

export const checkAssignmentConflicts = creerVerificationConflits({
  affectations: new AffectationsMongoose(),
});
```

`src/backend/operations/index.ts` devient :

```ts
// API publique du domaine `operations` pour les autres domaines et pour `src/app`.
export { computeEffectiveStatus } from "./domain/statut-effectif";
export { checkAssignmentConflicts } from "./composition";
export type { ConflictResult, DemandeAffectation } from "./domain/conflits";
```

- [ ] **Step 8 : Codemod, suppression de l'ancien module**

```bash
node scripts/dev/remplacer-imports.mjs "@/lib/conflicts" "@/backend/operations"
git diff --stat
git rm src/lib/conflicts.ts
grep -rn "lib/conflicts" src tests scripts
```

Expected : 4 fichiers modifiés (table des faits vérifiés). Le `grep` ne doit plus trouver que le **titre** `describe("Assignment Conflicts Checking (lib/conflicts.ts)", …)` de `tests/unit/conflicts.test.ts` (une chaîne, à laisser). `src/app/api/operations/[id]/route.ts` et `src/app/api/operations/route.ts` gardent chacun leur `await connectDB()` : ne pas les retirer.

- [ ] **Step 9 : Prouver que les règles d'architecture mordent**

Ajouter temporairement `import mongoose from "mongoose";` en tête de `src/backend/operations/domain/conflits.ts`, puis :

Run : `npx vitest run tests/architecture` → FAIL avec `R1 src/backend/operations/domain/conflits.ts importe « mongoose »`.

Annuler : `git checkout -- src/backend/operations/domain/conflits.ts` ; relancer → PASS.

- [ ] **Step 10 : Vérification et commit**

Run : `npx tsc --noEmit && npm run lint && npx vitest run` → vert, **934 tests**. Le filet de la tâche 1 et `tests/unit/conflicts.test.ts` passent sans autre changement que la ligne d'import de ce dernier.

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!data' ':!package.json'
git status
git commit -m "refactor(operations): détection de conflits en règle pure, port Affectations et adaptateur Mongoose"
```

---

### Task 4 : Visibilité — politique pure sur `Acteur`

**Files:**
- Create: `src/backend/operations/domain/visibilite.ts`, `src/backend/operations/domain/visibilite.test.ts`

**Interfaces:**
- Consomme : `Acteur` (`@/shared/acces/acteur`), `isChauffeur`/`isClientUser` (`@/shared/acces/permissions`).
- Produit (consommé par les cas d'usage de 4b/4c, **aucune route branchée dans ce sous-plan**) :
  ```ts
  export const MESSAGE_HORS_EQUIPE = "Opération non affectée à votre équipe";
  export const MESSAGE_CHAUFFEUR_SANS_EQUIPE = "Compte chauffeur sans équipe attribuée";
  export interface RattachementsOperation { clientId?: string | null; equipeId?: string | null }
  export function chauffeurSansEquipe(acteur: Acteur): boolean;
  export function dansPerimetreClient(acteur: Acteur, clientId?: string | null): boolean;
  export function dansPerimetreEquipe(acteur: Acteur, equipeId?: string | null): boolean;
  export function peutVoirOperation(acteur: Acteur, operation: RattachementsOperation): boolean;      // lecture : 404 sinon
  export function peutAgirSurOperation(acteur: Acteur, operation: RattachementsOperation): boolean;   // écriture terrain : 403 sinon
  export function perimetreDeLecture(acteur: Acteur): { clientId?: string; equipeId?: string };       // filtres imposés aux listes
  ```
  `null` = référence pendante (document référencé supprimé, leçon R2) ; `undefined` = pas d'affectation.

- [ ] **Step 1 : Écrire le test (échec attendu)**

```ts
// src/backend/operations/domain/visibilite.test.ts
import { describe, it, expect } from "vitest";
import type { Acteur } from "@/shared/acces/acteur";
import { USER_ROLES } from "@/shared/acces/roles";
// Oracle : les fonctions héritées que cette politique remplacera en 4b/4c.
import { isWithinClientScope, isWithinTeamScope, TEAM_SCOPE_ERROR } from "@/backend/comptes";
import {
  MESSAGE_CHAUFFEUR_SANS_EQUIPE,
  MESSAGE_HORS_EQUIPE,
  chauffeurSansEquipe,
  dansPerimetreClient,
  dansPerimetreEquipe,
  perimetreDeLecture,
  peutAgirSurOperation,
  peutVoirOperation,
} from "./visibilite";

const acteur = (role: Acteur["role"], rattachements: Partial<Acteur> = {}): Acteur => ({
  id: "u1",
  role,
  ...rattachements,
});

describe("périmètre client", () => {
  it.each(["admin", "dispatcher", "lecture", "chauffeur"] as const)("%s : aucune restriction de client", (role) => {
    expect(dansPerimetreClient(acteur(role), "client-a")).toBe(true);
    expect(dansPerimetreClient(acteur(role), undefined)).toBe(true);
  });

  it("un compte client ne voit que son client", () => {
    const client = acteur("client", { clientId: "client-a" });
    expect(dansPerimetreClient(client, "client-a")).toBe(true);
    expect(dansPerimetreClient(client, "client-b")).toBe(false);
    expect(dansPerimetreClient(client, undefined)).toBe(false);
    expect(dansPerimetreClient(client, null)).toBe(false);
  });

  it("un compte client sans périmètre ne voit rien", () => {
    expect(dansPerimetreClient(acteur("client"), undefined)).toBe(false);
    expect(dansPerimetreClient(acteur("client", { clientId: "" }), "")).toBe(false);
  });
});

describe("périmètre équipe", () => {
  it.each(["admin", "dispatcher", "lecture", "client"] as const)("%s : aucune restriction d'équipe", (role) => {
    expect(dansPerimetreEquipe(acteur(role), "equipe-a")).toBe(true);
    expect(dansPerimetreEquipe(acteur(role), undefined)).toBe(true);
  });

  it("un chauffeur n'agit que sur les opérations de son équipe", () => {
    const chauffeur = acteur("chauffeur", { equipeId: "equipe-a" });
    expect(dansPerimetreEquipe(chauffeur, "equipe-a")).toBe(true);
    expect(dansPerimetreEquipe(chauffeur, "equipe-b")).toBe(false);
  });

  it("une opération sans équipe, ou dont l'équipe a été supprimée, n'est visible d'aucun chauffeur", () => {
    const chauffeur = acteur("chauffeur", { equipeId: "equipe-a" });
    expect(dansPerimetreEquipe(chauffeur, undefined)).toBe(false);
    expect(dansPerimetreEquipe(chauffeur, null)).toBe(false);
    expect(dansPerimetreEquipe(chauffeur, "")).toBe(false);
  });

  it("un chauffeur sans équipe n'agit sur rien", () => {
    expect(dansPerimetreEquipe(acteur("chauffeur"), "equipe-a")).toBe(false);
    expect(dansPerimetreEquipe(acteur("chauffeur", { equipeId: "" }), "")).toBe(false);
  });
});

describe("chauffeurSansEquipe", () => {
  it("vrai seulement pour un chauffeur sans équipe", () => {
    expect(chauffeurSansEquipe(acteur("chauffeur"))).toBe(true);
    expect(chauffeurSansEquipe(acteur("chauffeur", { equipeId: "" }))).toBe(true);
    expect(chauffeurSansEquipe(acteur("chauffeur", { equipeId: "equipe-a" }))).toBe(false);
    expect(chauffeurSansEquipe(acteur("admin"))).toBe(false);
  });
});

describe("peutVoirOperation / peutAgirSurOperation", () => {
  const operation = { clientId: "client-a", equipeId: "equipe-a" };

  it("lecture : client ET équipe doivent être dans le périmètre", () => {
    expect(peutVoirOperation(acteur("admin"), operation)).toBe(true);
    expect(peutVoirOperation(acteur("client", { clientId: "client-a" }), operation)).toBe(true);
    expect(peutVoirOperation(acteur("client", { clientId: "client-b" }), operation)).toBe(false);
    expect(peutVoirOperation(acteur("chauffeur", { equipeId: "equipe-a" }), operation)).toBe(true);
    expect(peutVoirOperation(acteur("chauffeur", { equipeId: "equipe-b" }), operation)).toBe(false);
  });

  it("écriture terrain : seule l'équipe compte", () => {
    expect(peutAgirSurOperation(acteur("dispatcher"), operation)).toBe(true);
    expect(peutAgirSurOperation(acteur("chauffeur", { equipeId: "equipe-a" }), operation)).toBe(true);
    expect(peutAgirSurOperation(acteur("chauffeur", { equipeId: "equipe-b" }), operation)).toBe(false);
    expect(peutAgirSurOperation(acteur("chauffeur", { equipeId: "equipe-a" }), { clientId: "client-a" })).toBe(false);
  });
});

describe("perimetreDeLecture", () => {
  it("les rôles internes n'imposent aucun filtre", () => {
    for (const role of ["admin", "dispatcher", "lecture"] as const) {
      expect(perimetreDeLecture(acteur(role, { clientId: "client-a", equipeId: "equipe-a" }))).toEqual({});
    }
  });

  it("un compte client impose son client ; un chauffeur impose son équipe", () => {
    expect(perimetreDeLecture(acteur("client", { clientId: "client-a" }))).toEqual({ clientId: "client-a" });
    expect(perimetreDeLecture(acteur("chauffeur", { equipeId: "equipe-a" }))).toEqual({ equipeId: "equipe-a" });
  });
});

describe("messages", () => {
  it("sont ceux des routes actuelles, au mot près", () => {
    expect(MESSAGE_HORS_EQUIPE).toBe(TEAM_SCOPE_ERROR);
    expect(MESSAGE_CHAUFFEUR_SANS_EQUIPE).toBe("Compte chauffeur sans équipe attribuée");
  });
});

// Filet de parité : à supprimer avec les fonctions héritées quand plus aucune route ne les utilise.
describe("parité avec les fonctions héritées de comptes/http/acteur.ts", () => {
  const rattachementsActeur = [undefined, "", "aaa"];
  const rattachementsDocument = [undefined, null, "", "aaa", "bbb"];

  for (const role of USER_ROLES) {
    for (const propre of rattachementsActeur) {
      for (const document of rattachementsDocument) {
        it(`${role} / acteur=${JSON.stringify(propre)} / document=${JSON.stringify(document)}`, () => {
          const herite = { role, clientId: propre, equipeId: propre } as never;
          const a = acteur(role, { clientId: propre, equipeId: propre });
          expect(dansPerimetreClient(a, document)).toBe(isWithinClientScope(herite, document));
          expect(dansPerimetreEquipe(a, document)).toBe(isWithinTeamScope(herite, document));
        });
      }
    }
  }
});
```

Run : `npx vitest run src/backend/operations/domain/visibilite.test.ts` → FAIL (module introuvable).

- [ ] **Step 2 : Écrire la politique**

```ts
// src/backend/operations/domain/visibilite.ts
import type { Acteur } from "@/shared/acces/acteur";
import { isChauffeur, isClientUser } from "@/shared/acces/permissions";

/** Message unique quand une opération n'appartient pas à l'équipe du chauffeur. */
export const MESSAGE_HORS_EQUIPE = "Opération non affectée à votre équipe";
export const MESSAGE_CHAUFFEUR_SANS_EQUIPE = "Compte chauffeur sans équipe attribuée";

/** `null` : référence pendante (document référencé supprimé) ; `undefined` : pas d'affectation. */
export interface RattachementsOperation {
  clientId?: string | null;
  equipeId?: string | null;
}

/** Un chauffeur sans équipe ne lit aucune opération (refus avant toute lecture). */
export function chauffeurSansEquipe(acteur: Acteur): boolean {
  return isChauffeur(acteur.role) && !acteur.equipeId;
}

/** Les rôles internes voient tout ; un compte `client` ne voit que son client. */
export function dansPerimetreClient(acteur: Acteur, clientId?: string | null): boolean {
  if (!isClientUser(acteur.role)) return true;
  if (!acteur.clientId) return false;
  return (clientId ?? "") === acteur.clientId;
}

/**
 * Refus par défaut : un chauffeur sans équipe n'agit sur rien, et une opération
 * non affectée n'est pas visible d'un chauffeur.
 */
export function dansPerimetreEquipe(acteur: Acteur, equipeId?: string | null): boolean {
  if (!isChauffeur(acteur.role)) return true;
  if (!acteur.equipeId) return false;
  const equipe = equipeId ?? "";
  return equipe !== "" && equipe === acteur.equipeId;
}

/** Lecture d'une opération (détail, rapport) : hors périmètre, elle est « non trouvée ». */
export function peutVoirOperation(acteur: Acteur, operation: RattachementsOperation): boolean {
  return dansPerimetreClient(acteur, operation.clientId) && dansPerimetreEquipe(acteur, operation.equipeId);
}

/** Écriture terrain (statut, photos) : seule l'équipe du chauffeur compte. */
export function peutAgirSurOperation(acteur: Acteur, operation: RattachementsOperation): boolean {
  return dansPerimetreEquipe(acteur, operation.equipeId);
}

/** Filtres imposés aux listes (opérations, planning), quels que soient les filtres demandés. */
export function perimetreDeLecture(acteur: Acteur): { clientId?: string; equipeId?: string } {
  const perimetre: { clientId?: string; equipeId?: string } = {};
  if (isClientUser(acteur.role)) perimetre.clientId = acteur.clientId;
  if (isChauffeur(acteur.role)) perimetre.equipeId = acteur.equipeId;
  return perimetre;
}
```

- [ ] **Step 3 : Vérifier**

Run : `npx vitest run src/backend/operations/domain/visibilite.test.ts` → PASS (**94 tests** : 19 explicites + 75 de parité, soit 5 rôles × 3 × 5).

Si un cas de parité échoue, **la politique est fausse, pas l'oracle** : corriger `visibilite.ts`.

- [ ] **Step 4 : Vérification et commit**

Run : `npx tsc --noEmit && npm run lint && npx vitest run` → vert, **1028 tests**.

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!data' ':!package.json'
git status
git commit -m "refactor(operations): politique de visibilité pure sur Acteur (client, équipe), parité avec les gardes héritées"
```

---

### Task 5 : Documentation, statuts et revue du sous-jalon

**Files:** `README.md`, `docs/superpowers/plans/2026-09-20-refactor-architecture-master.md`, `docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md`

- [ ] **Step 1 : README** (section « Architecture », paragraphe « État de la migration »). Retirer « opérations » de la phrase « Les autres domaines (opérations, récurrences, …) restent entièrement dans les dossiers hérités » et ajouter : « Le domaine `operations` est **en cours** (R4a : `src/backend/operations/domain` — statut effectif, conflits d'affectation, visibilité ; port `Affectations` et son adaptateur ; les transitions de statut sont dans `src/shared/operations/transitions.ts`, partagées avec le frontend) ; ses routes (`src/app/api/operations/**`), son modèle (`src/models/Operation.ts`) et ses validateurs restent hérités jusqu'à R4b-R4d. » Vérifier chaque chemin cité (`ls`).

- [ ] **Step 2 : Statuts.** Plan maître : la ligne R4 passe de « À détailler » à **« En cours (4a réalisé ; 4b, 4c, 4d à venir) »**. Spec : ligne de statut → « R0, R1, R2 et R3 réalisés ; R4 en cours (4a réalisé) ; jalons R5 à R9 à venir ». Dans la table §7 de la spec, compléter la ligne `lib/conflicts.ts`, `lib/status-transitions.ts` : « `backend/operations/domain` (+ adaptateur `Affectations`) ; table des transitions dans `shared/operations/transitions.ts` (utilisée par le frontend) ». Ajouter au plan maître une section « Enseignements de R4a » avec, au minimum : (1) une règle utilisée des deux côtés va dans `shared/`, pas dans `domain/`, même quand la table de correspondance de la spec dit `domain` — vérifier les importeurs frontend avant de choisir la cible ; (2) garder le nom et la signature d'une fonction publique héritée (paramètre d'horloge **optionnel**) permet de ne toucher que les chemins d'import des tests ; (3) l'écart `connectDB()` de l'adaptateur `Affectations` et sa justification ; (4) tout ce que l'exécution a réellement appris et que ce plan n'avait pas prévu.

- [ ] **Step 3 : Vérification complète**

```bash
npx tsc --noEmit && npm run lint && npx vitest run
MONGODB_URI="mongodb://127.0.0.1:9/inexistant" NEXTAUTH_SECRET="verification-build" \
NEXTAUTH_URL="http://localhost:3000" NEXT_TELEMETRY_DISABLED=1 npx next build
```

Expected : tout vert, 1028 tests ; compilation Next réussie (des fichiers `route.ts` et une `page.tsx` ont changé d'imports).

- [ ] **Step 4 : Non-régression ciblée** (à consigner dans le rapport) : `git diff main --stat -- tests/unit tests/integration` → un fichier créé (tâche 1) et deux fichiers modifiés (`conflicts.test.ts`, `status-transitions.test.ts`), **imports seulement** (`git diff main -- tests/unit` à relire ligne par ligne). `grep -rn "lib/conflicts\|lib/status-transitions" src tests scripts` → uniquement les deux titres de `describe`. `ls src/lib` → ni `conflicts.ts` ni `status-transitions.ts`.

- [ ] **Step 5 : Commit**

```bash
git add README.md docs/superpowers
git commit -m "docs: statuts du sous-jalon R4a (domaine operations : statuts, conflits, visibilité)"
```

- [ ] **Step 6 : Revue du sous-jalon** — **effectuée par le contrôleur** (revue finale de branche complète, modèle le plus capable ; ne pas la dispatcher comme tâche), comme pour R1 à R3c. Critères : `detecterConflits` + `AffectationsMongoose` reproduisent ligne à ligne `src/lib/conflicts.ts` de `main` (`git show main:src/lib/conflicts.ts`) — même filtre Mongo, même absence de tri, mêmes messages, même ordre ; `computeEffectiveStatus` identique hors paramètre optionnel ; la table des transitions est une copie exacte ; aucun fichier de `domain/` ou `application/` n'importe `mongoose`, `next` ou `platform` ; les six routes `src/app/api/operations/**` n'ont changé que par une ligne d'import ; `package.json` absent de tous les commits.

---

## Auto-relecture

- **Couverture de la spec (R4a = « domaine : statuts, conflits, visibilité ») :** transitions de statut (tâche 2, `shared`) ; statut effectif (tâche 2) ; chevauchement/conflits + port `Affectations` + adaptateur (tâche 3) ; visibilité par rôle et équipe (tâche 4) ; `Horloge` : préparée par le paramètre `maintenant` (branchée par les cas d'usage de 4b). **Restent pour 4b-4d, volontairement :** `OperationRepository`, déplacement du modèle et des validateurs, cas d'usage CRUD/planning/statut/photos, plafonds de photos, `GenerateurRapportPdf`, branchement de la visibilité sur les routes, règle « Terminée sans En cours », statut initial (`Affectée` si équipe et véhicule).
- **Cohérence des noms :** `checkAssignmentConflicts`, `canTransition`, `getNextStatuses`, `computeEffectiveStatus` (inchangés) ; `detecterConflits`, `fenetreDemandee`, `finPrevue`, `seChevauchent`, `ConflictResult`, `DemandeAffectation`, `AffectationExistante`, `STATUTS_SANS_CONFLIT`, `DUREE_PAR_DEFAUT_MINUTES` (tâche 3, mêmes noms dans le domaine, le port, le faux, l'adaptateur et les tests) ; `Affectations.candidates(CritereAffectations)` avec `debutAvant`/`exclureOperationId` (port, faux, adaptateur, cas d'usage) ; `dansPerimetreClient`, `dansPerimetreEquipe`, `peutVoirOperation`, `peutAgirSurOperation`, `perimetreDeLecture`, `chauffeurSansEquipe` (tâche 4).
- **Décomptes de tests attendus :** 890 → 895 (tâche 1, +5) → 906 (tâche 2, +11) → 934 (tâche 3, +10 +8 +10) → 1028 (tâche 4, +94). Un écart de quelques unités vient d'un `it.each` mal compté par ce plan : à noter dans le rapport, pas à « corriger » en retirant des tests.
- **Points de vigilance :** (1) la table des transitions va dans `shared/`, pas dans `domain/` — deux composants frontend l'importent ; (2) ne **jamais** trier le résultat de `Operation.find` dans l'adaptateur : l'ordre des conflits dans le corps du 409 en dépend ; (3) les tests de véracité (`if (equipeId)`) doivent rester des tests de véracité, pas des `!== undefined` — une chaîne vide compte comme « pas de ressource » ; (4) `dureeEstimeeMinutes` de la demande : valeur par défaut par déstructuration (s'applique à `undefined` seulement), celle de l'opération existante : `??` (s'applique aussi à `null`) — les deux formes actuelles sont conservées telles quelles ; (5) la matrice de parité de la tâche 4 importe `@/backend/comptes` depuis un test collé au code : permis (le vérificateur ignore les `*.test.ts`), et à supprimer quand les fonctions héritées disparaîtront ; (6) les `await connectDB()` des routes héritées restent en place ; (7) `package.json` et `skills-lock.json` ne sont jamais indexés.
