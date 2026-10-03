# Refactoring R4b — Domaine `operations` : CRUD et planning : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire passer la liste, la création, le détail, la modification, la suppression et le planning des opérations par l'architecture hexagonale : modèle et validateurs déplacés, entité `Operation`, port `OperationRepository` et son adaptateur Mongoose, cas d'usage (périmètre, conflits, statut initial, statut effectif), contrôleurs ; trois fichiers `route.ts` deviennent des ré-exports. Deuxième des quatre sous-plans de R4. **Hors périmètre :** `PATCH …/statut`, `POST/DELETE …/photos` (4c) et `GET …/rapport` (4d) restent des routes héritées — elles changent seulement de chemin d'import.

**Architecture:** `src/backend/operations/` reçoit `domain/{operation,erreurs}.ts` et un `domain/ports.ts` complété, `application/cas-d-usage.ts`, `infrastructure/mongoose/{operation.model,operation.repository.mongoose}.ts`, `infrastructure/en-memoire/operation.repository.en-memoire.ts`, `http/{operation.schema,acteur,presentation,erreurs-http,liste.controleur,detail.controleur,planning.controleur}.ts`. Les relations (`clientId`, `siteId`, `equipeId`, `vehiculeId`, `equipementIds`, auteur d'historique) sont peuplées à **trois niveaux** selon la route (résumé, liste, détail) : le dépôt recopie exactement les champs sélectionnés par `.populate()`, la présentation les restitue sous `_id`. La politique de visibilité écrite en R4a (`domain/visibilite.ts`) est branchée ici pour la première fois.

**Tech Stack:** Next.js 16 (`src/`), TypeScript, Mongoose 8, Zod, Vitest + mongodb-memory-server, ESLint 9.

**Spec / feuille de route:** `docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md` (§5 `Acteur` : « les cas d'usage le reçoivent en paramètre et appliquent eux-mêmes le cloisonnement » ; §6 ligne `operations` : « lister (filtres + périmètre), créer (avec conflit), modifier, supprimer, […] planning | `OperationRepository`, `Affectations`, […] `Horloge` ») ; `docs/superpowers/plans/2026-09-20-refactor-architecture-master.md` (contraintes, recette, enseignements R0-R4a) ; `docs/superpowers/plans/2026-10-03-refactor-r4a-operations-domaine.md` (ce qui existe déjà) ; modèle de référence pour une relation peuplée : `src/backend/clients-sites/**` (R2).

## Global Constraints

- **Aucun changement de comportement** : mêmes codes HTTP, mêmes corps JSON (`_id`, `createdAt`, `updatedAt`, `__v`, formes peuplées par route), mêmes messages au mot près (« Non trouvé », « Identifiant invalide », « Conflit d'affectation », « Compte chauffeur sans équipe attribuée », « Permission insuffisante »), **même ordre des vérifications** (voir la table des faits), mêmes exceptions non interceptées (un identifiant vide ou un filtre illisible lève aujourd'hui une erreur Mongoose qui remonte : elle doit continuer à remonter, **ne pas la « corriger »**).
- **Écarts connus et acceptés** (Global Constraints du plan maître) : l'ordre des clés JSON peut changer (mêmes clés, mêmes valeurs) ; une opération dont un champ du schéma est absent en base (document écrit hors Mongoose) est présentée avec la valeur par défaut du schéma au lieu d'omettre le champ (`dureeEstimeeMinutes: 120`, `equipementIds: []`, `photos: []`, `historiqueStatuts: []`, `uniteQuantite: "Litres"`, chaînes vides, `clientId`/`siteId` absents → `null`) ; un champ stocké inconnu du schéma n'est plus renvoyé. Les champs **facultatifs sans défaut** (`equipeId`, `vehiculeId`, `quantiteCollectee`, `ancienStatut`, `parUtilisateur`) restent **omis** quand ils sont absents.
- Les tests existants ne changent que par leurs **chemins d'import**. Aucune assertion supprimée, affaiblie ou passée en `skip`.
- À chaque commit : `npx tsc --noEmit` propre, `npm run lint` (0 erreur), `npx vitest run` tout vert (**1028 tests / 78 fichiers au départ**, mesuré sur `main` `62a82c4`).
- Règles de dépendance : `domain/` n'importe que `@/shared/**` et lui-même (jamais `mongoose`, `next`, `@/backend/platform/**`, même en `type-only` : les ports `Horloge` et `VerificationConflits` sont déclarés localement) ; `application/` n'importe que `domain/` et `shared/` ; `http/` n'atteint `infrastructure/` que par `composition.ts`.
- Préserver chaque `await connectDB()` : le dépôt l'appelle avant **chaque** requête (leçon R3b : la suite de tests ne détecte pas son absence).
- Ne jamais lire ni afficher `.env.local` ; ne jamais lancer `npm run build`, `npm run seed`, `scripts/seed-admin.ts` ni `scripts/send-test-mail.ts`. Compilation Next : uniquement `verifier-build` (plan maître).
- Ne jamais stager `.agents/`, `.claude/`, `skills-lock.json`, `rapports/`, `data/`, `package.json`. Commande d'ajout : `git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!data' ':!package.json'` puis `git status`.
- Après chaque codemod : `git diff --stat`, `git checkout -- <fichier>` pour tout fichier modifié à tort — **jamais** `git reset` ; grep indépendant qu'aucun ancien chemin ne survit.
- Branche : `refactor/r4b-operations-crud-planning` créée depuis `main` (`62a82c4`). Fusion locale après revue ; aucun push sans accord.

### Faits vérifiés sur le code actuel (base du plan)

Établis par lecture **et par une sonde exécutée contre les routes actuelles** (réponses brutes). Tous sont épinglés par `tests/integration/operations-crud-caracterisation.test.ts` (29 tests, **déjà écrit et vert sur `main`** — tâche 1).

**Modèle `Operation`** (`src/models/Operation.ts`, 109 lignes) : `clientId`, `siteId` (ObjectId, requis) ; `natureIntervention` (requis) ; `dateHeurePrevue` (requis) ; `dureeEstimeeMinutes` (défaut 120) ; `equipeId?`, `vehiculeId?` (ObjectId, sans défaut) ; `equipementIds` (tableau) ; `informationsParticulieres` (défaut `""`) ; `statut` (enum, défaut `Planifiée`) ; `historiqueStatuts` (`{ statut, date, parUtilisateur?, ancienStatut? }`, sans `_id`) ; `quantiteCollectee?` (sans défaut) ; `uniteQuantite` (défaut `Litres`) ; `remarquesTerrain`, `nomSignataireClient`, `signatureClient`, `rapportPdf` (défaut `""`) ; `photos` (`{ url, nom, uploadedAt }`, sans `_id`, défaut `[]`) ; timestamps. Cinq index.

**Niveaux de peuplement** (champs sélectionnés par `.populate()`) :

| Niveau | Routes | `clientId` | `siteId` | `equipeId` | `vehiculeId` | `equipementIds` | `historiqueStatuts.parUtilisateur` |
|---|---|---|---|---|---|---|---|
| `resume` | `POST` 201, `PUT` 200, planning | `nom` | `nom` | `nom` | `identification` | identifiants bruts | identifiant brut |
| `liste` | `GET /api/operations` | `nom` | `nom adresse` | `nom` | `identification` | identifiants bruts | identifiant brut |
| `detail` | `GET /api/operations/[id]` | `nom contact` | `nom adresse typeDechets` | `nom membres` | `identification type` | `nom type` | `nom` |

Une relation peuplée dont le document a été supprimé vaut `null` (JSON `null`) ; un équipement supprimé **disparaît** du tableau ; `equipeId`/`vehiculeId` jamais affectés sont **absents** du JSON.

| Route | Ordre exact des vérifications | Comportement | Codes |
|---|---|---|---|
| `GET /api/operations` | `requireAuth()` → chauffeur sans équipe (403) → lecture | Filtres `clientId`, `siteId`, `equipeId`, `vehiculeId`, `statut` (test de véracité, transmis **tels quels** à Mongoose : un identifiant illisible lève `CastError`, un statut inconnu renvoie une liste vide) ; `dateDebut`/`dateFin` → `$gte`/`$lte` (bornes **incluses**, `new Date(chaine)` sans validation) ; périmètre imposé **après** les filtres (`client` → son `clientId`, `chauffeur` → son `equipeId`) ; `page = Math.max(1, parseInt(page \|\| "1"))`, `limit = Math.min(100, parseInt(limit \|\| "20"))`, `skip = (page-1)*limit` — valeurs hors norme **non corrigées** (`page=abc` → `page: null` et tous les éléments ; `limit=0`, `limit=-5`, `limit=abc` → tous les éléments, `limit` renvoyé `0`, `-5`, `null`) ; tri `dateHeurePrevue` décroissant ; `{ items, total, page, limit }`, `total` = `countDocuments(filtre)` | 200, 401, 403 |
| `POST /api/operations` | `requireAuth(true)` → `req.json()` → Zod (400 `{ error: flatten() }`) → conflits (409) → création | Le `statut` du corps est **ignoré** : `Affectée` si équipe **et** véhicule (véracité), sinon `Planifiée` ; `historiqueStatuts = [{ statut, date: maintenant, parUtilisateur: id de session }]` ; relecture peuplée niveau `resume` | 201, 400, 401, 403, 409 |
| `GET /api/operations/[id]` | `requireAuth()` → chauffeur sans équipe (403) → identifiant (400) → lecture → introuvable (404) → périmètre client (404) → périmètre équipe (404) | Niveau `detail` | 200, 400, 401, 403, 404 |
| `PUT /api/operations/[id]` | `requireAuth(true)` → identifiant (400) → `req.json()` → Zod (400) → conflits avec `excludeOperationId = id` (409, **avant** de savoir si l'opération existe) → `findByIdAndUpdate` → introuvable (404) | Les clés absentes du corps validé ne sont pas touchées (`equipeId`, `vehiculeId`, `statut`, `quantiteCollectee`) ; les clés à défaut Zod **sont réécrites** (`equipementIds: []`, `informationsParticulieres: ""`, `dureeEstimeeMinutes: 120`, `uniteQuantite: "Litres"`, `remarquesTerrain`/`nomSignataireClient`/`signatureClient: ""`) ; un `statut` fourni est appliqué **tel quel**, sans transition vérifiée ni historique ; niveau `resume` | 200, 400, 401, 403, 404, 409 |
| `DELETE /api/operations/[id]` | `requireAuth(true)` → identifiant (400) → suppression | `{ success: true }` | 200, 400, 401, 403, 404 |
| `GET /api/operations/planning` | `requireAuth()` → chauffeur sans équipe (403) → lecture | Filtre = périmètre + `dateDebut`/`dateFin` ; **aucun tri** ; niveau `resume` ; par opération : `statut` effectif, `end = début + (durée ?? 120) min`, `title = "<nom du client ou « Client »> — <nature>"`, couleur par statut (table ci-dessous), `extendedProps { statut, site, equipe, vehicule }` (clés omises quand la relation manque) | 200, 401, 403 |

Couleurs du planning : `Planifiée #546E7A`, `Affectée #3949AB`, `En route #FB8C00`, `En cours #1976D2`, `Terminée #2E7D32`, `Rapportée #1B5E20`, `Retardée #E65100`, `Annulée #C62828` ; statut inconnu → la chaîne `"text-status-planned"` (repli actuel, `STATUS_CONFIG.Planifiée.color`).

`optionalObjectIdSchema` accepte la chaîne vide : `equipeId: ""` passe Zod, compte comme « pas d'équipe » pour les conflits et le statut initial, puis fait échouer Mongoose (`ValidationError` à la création, `CastError` à la modification). Comportement actuel, à conserver.

**Importeurs à recodemoder** (point de départ, à revérifier par grep) :

- `@/models/Operation` (19) : `src/app/api/operations/{route,[id]/route,[id]/photos/route,[id]/statut/route,[id]/rapport/route,planning/route}.ts`, `src/app/api/{dashboard/stats,recurrences/generate,import}/route.ts`, `src/app/(dashboard)/page.tsx`, `src/backend/platform/base-de-donnees/enregistrement-modeles.ts`, `src/backend/operations/infrastructure/mongoose/affectations.mongoose{,.test}.ts`, `tests/unit/conflicts.test.ts`, `tests/integration/{phase2-import-photos,dashboard-planning,vehicules-caracterisation,chauffeur-scope,authz-roles,equipements-caracterisation,recurrences-api,operations-crud-caracterisation}.test.ts` ; **plus** `scripts/seed-admin.ts` (import **relatif** `../src/models/Operation`, à corriger à la main, script jamais exécuté).
- `@/lib/validators/operation` (4) : `src/app/api/operations/{route,[id]/route,[id]/statut/route}.ts`, `tests/unit/validators.test.ts`.

## Review Focus

1. **Relation supprimée** (client, équipe, auteur d'historique, équipement) : `null` JSON réel — jamais la chaîne `"null"` ni une exception ; équipement supprimé retiré — tâche 3 (contrat du dépôt) et filet de la tâche 1.
2. **`PUT` qui omet l'équipe ou le véhicule** : l'affectation existante est conservée (aucune clé `undefined` ne doit devenir un `$unset` ou un `null`) — tâche 3 (contrat du dépôt) et filet.
3. **Compte client ou chauffeur qui force un autre `clientId`/`equipeId` dans l'URL** : son périmètre l'emporte — tâche 4 (cas d'usage) et filet.
4. **Pagination hors norme** (`page=abc`, `limit=0`, `limit=500`) : mêmes valeurs renvoyées qu'aujourd'hui, pas d'exception — filet ; le contrôleur recopie les trois lignes de calcul à l'identique (tâche 5).
5. **Opération prévue dans le passé au planning** : statut effectif `Retardée` calculé avec l'horloge injectée, y compris à l'instant exact (pas de bascule) — tâche 4 (cas d'usage, horloge fixe).

## File Structure

| Fichier | Responsabilité |
|---|---|
| `tests/integration/operations-crud-caracterisation.test.ts` (déjà écrit) | Filet : formes exactes des 6 gestionnaires |
| `src/backend/operations/infrastructure/mongoose/operation.model.ts` (déplacé) | Modèle Mongoose, schéma inchangé |
| `src/backend/operations/http/operation.schema.ts` (déplacé + `versSaisieOperation`) | Schémas Zod `operationSchema`, `statusUpdateSchema` |
| `src/backend/operations/domain/operation.ts` (créer) | Entité, références peuplées, saisie, filtres |
| `src/backend/operations/domain/erreurs.ts` (créer) | `OperationIntrouvable`, `ChauffeurSansEquipe`, `ConflitAffectation` |
| `src/backend/operations/domain/ports.ts` (compléter) | `OperationRepository`, `VerificationConflits`, `Horloge` |
| `src/backend/operations/infrastructure/mongoose/operation.repository.mongoose.ts` (+ test de contrat) | Requêtes, peuplement par niveau, document → entité |
| `src/backend/operations/infrastructure/en-memoire/operation.repository.en-memoire.ts` (créer) | Faux pour les tests de cas d'usage |
| `src/backend/operations/application/cas-d-usage.ts` (+ test) | `creerCasDUsageOperations` |
| `src/backend/operations/http/{acteur,presentation,erreurs-http}.ts` (créer) | Session → `Acteur` ; entité → JSON ; erreur métier → réponse |
| `src/backend/operations/http/{liste,detail,planning}.controleur.ts` (créer) | Contrôleurs |
| `src/app/api/operations/{route,[id]/route,planning/route}.ts` (réduire) | Ré-exports |
| `src/models/Operation.ts`, `src/lib/validators/operation.ts` (supprimés par déplacement) | — |

---

### Task 1 : Filet — formes exactes du CRUD et du planning

**Files:**
- Test (déjà présent, non suivi par Git) : `tests/integration/operations-crud-caracterisation.test.ts`

**Interfaces:**
- Produit : un oracle de 29 tests qui doit rester vert à travers les tâches 2 à 5, **sans autre modification que la ligne d'import du modèle** (codemod de la tâche 2).

- [ ] **Step 1 : Créer la branche**

```bash
git checkout main && git checkout -b refactor/r4b-operations-crud-planning
git status --short   # attendu : ?? tests/integration/operations-crud-caracterisation.test.ts (et ce plan)
```

Si le fichier de test est absent, **s'arrêter** : il a été écrit et validé avec ce plan (sonde du 3 octobre 2026) et ne doit pas être réinventé.

- [ ] **Step 2 : Vérifier qu'il passe sur le code actuel**

Run : `npx vitest run tests/integration/operations-crud-caracterisation.test.ts`
Expected : 29 tests PASS. Si l'un échoue, **le test est faux, pas le code** : le corriger pour décrire le comportement réel, ne jamais toucher aux routes dans cette tâche.

- [ ] **Step 3 : Vérification et commit**

Run : `npx tsc --noEmit && npm run lint && npx vitest run` → vert, **1057 tests**.

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!data' ':!package.json'
git status
git commit -m "test(operations): caractérisation des formes exactes du CRUD et du planning"
```

---

### Task 2 : Déplacement du modèle et des validateurs

**Files:**
- Move: `src/models/Operation.ts` → `src/backend/operations/infrastructure/mongoose/operation.model.ts` ; `src/lib/validators/operation.ts` → `src/backend/operations/http/operation.schema.ts`
- Modify: les importeurs listés dans les faits vérifiés ; `scripts/seed-admin.ts` (import relatif)

**Interfaces:**
- Produit : `Operation`, `IOperation`, `IStatusHistory`, `IOperationPhoto` depuis `@/backend/operations/infrastructure/mongoose/operation.model` ; `operationSchema`, `statusUpdateSchema`, `OperationInput` depuis `@/backend/operations/http/operation.schema`. **Contenu des deux fichiers strictement inchangé** dans cette tâche.

- [ ] **Step 1 : Déplacer et recodemoder**

```bash
git mv src/models/Operation.ts src/backend/operations/infrastructure/mongoose/operation.model.ts
git mv src/lib/validators/operation.ts src/backend/operations/http/operation.schema.ts
node scripts/dev/remplacer-imports.mjs "@/models/Operation" "@/backend/operations/infrastructure/mongoose/operation.model"
node scripts/dev/remplacer-imports.mjs "@/lib/validators/operation" "@/backend/operations/http/operation.schema"
git diff --stat
grep -rn "models/Operation\|validators/operation" src tests scripts
```

Expected : le `grep` ne trouve plus que `scripts/seed-admin.ts` (import relatif). Le corriger à la main :

```ts
import { Operation } from "../src/backend/operations/infrastructure/mongoose/operation.model";
```

Dans `src/backend/operations/infrastructure/mongoose/affectations.mongoose.ts`, remplacer les deux lignes

```ts
// Modèle encore hérité : il rejoindra `./operation.model` au sous-jalon 4b.
import { Operation } from "@/backend/operations/infrastructure/mongoose/operation.model";
```

par

```ts
import { Operation } from "./operation.model";
```

et, dans `affectations.mongoose.test.ts`, l'import du modèle par `import { Operation } from "./operation.model";`.

- [ ] **Step 2 : Vérifier**

```bash
ls src/models   # attendu : Recurrence.ts seulement
npx tsc --noEmit && npm run lint && npx vitest run
```

Expected : vert, **1057 tests**. `git diff main --stat -- tests` : uniquement des lignes d'import (plus le fichier créé en tâche 1).

- [ ] **Step 3 : Commit**

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!data' ':!package.json'
git status
git commit -m "refactor(operations): modèle et schémas Zod déplacés dans le domaine (aucun changement de contenu)"
```

---

### Task 3 : Entité, ports, dépôt Mongoose

**Files:**
- Create: `src/backend/operations/domain/operation.ts`, `src/backend/operations/domain/erreurs.ts`, `src/backend/operations/infrastructure/mongoose/operation.repository.mongoose.ts`, `src/backend/operations/infrastructure/mongoose/operation.repository.mongoose.test.ts`
- Modify: `src/backend/operations/domain/ports.ts`

**Interfaces:**
- Consomme : `ConflictResult`, `DemandeAffectation` (`domain/conflits.ts`, R4a) ; le modèle déplacé en tâche 2.
- Produit :
  ```ts
  // domain/operation.ts
  export type Reference<T> = T | string | null;            // peuplée | identifiant brut | référence pendante
  export interface ClientPeuple { id: string; nom?: string; contact?: { telephone?: string; email?: string } }
  export interface SitePeuple { id: string; nom?: string; adresse?: string; typeDechets?: string[] }
  export interface EquipePeuplee { id: string; nom?: string; membres?: string[] }
  export interface VehiculePeuple { id: string; identification?: string; type?: string }
  export interface EquipementPeuple { id: string; nom?: string; type?: string }
  export interface UtilisateurPeuple { id: string; nom?: string }
  export interface EntreeHistorique { statut: OperationStatus; date: Date; parUtilisateur?: Reference<UtilisateurPeuple>; ancienStatut?: OperationStatus }
  export interface PhotoOperation { url: string; nom: string; uploadedAt: Date }
  export interface Operation { id: string; clientId: Reference<ClientPeuple>; siteId: Reference<SitePeuple>; natureIntervention: string; dateHeurePrevue: Date; dureeEstimeeMinutes: number; equipeId?: Reference<EquipePeuplee>; vehiculeId?: Reference<VehiculePeuple>; equipementIds: (string | EquipementPeuple)[]; informationsParticulieres: string; statut: OperationStatus; historiqueStatuts: EntreeHistorique[]; quantiteCollectee?: number; uniteQuantite: QuantiteUnite; remarquesTerrain: string; nomSignataireClient: string; signatureClient: string; photos: PhotoOperation[]; rapportPdf: string; createdAt?: Date; updatedAt?: Date; revision?: number }
  export interface OperationSaisie { clientId: string; siteId: string; natureIntervention: string; dateHeurePrevue: Date; dureeEstimeeMinutes: number; equipeId?: string; vehiculeId?: string; equipementIds: string[]; informationsParticulieres: string; statut?: OperationStatus; quantiteCollectee?: number; uniteQuantite: QuantiteUnite; remarquesTerrain: string; nomSignataireClient: string; signatureClient: string }
  export interface StatutInitial { statut: OperationStatus; date: Date; parUtilisateur: string }
  export interface FiltreOperations { clientId?: string; siteId?: string; equipeId?: string; vehiculeId?: string; statut?: string; dateDebut?: Date; dateFin?: Date }
  export interface Pagination { skip: number; limit: number }
  export function idDeReference(reference: Reference<{ id: string }> | undefined): string | null | undefined;
  // domain/erreurs.ts
  export class OperationIntrouvable extends Error {}      // message « Non trouvé »
  export class ChauffeurSansEquipe extends Error {}       // message MESSAGE_CHAUFFEUR_SANS_EQUIPE
  export class ConflitAffectation extends Error { readonly conflits: ConflictResult[] }  // message « Conflit d'affectation »
  // domain/ports.ts (ajouts)
  export interface OperationRepository {
    lister(filtre: FiltreOperations, pagination: Pagination): Promise<{ items: Operation[]; total: number }>;  // niveau liste, tri date décroissante
    listerPourPlanning(filtre: FiltreOperations): Promise<Operation[]>;                                         // niveau résumé, sans tri
    trouverDetailParId(id: string): Promise<Operation | null>;                                                  // niveau détail
    creer(saisie: OperationSaisie, initial: StatutInitial): Promise<Operation>;                                 // niveau résumé
    modifier(id: string, saisie: OperationSaisie): Promise<Operation | null>;                                   // niveau résumé
    supprimer(id: string): Promise<boolean>;
  }
  export type VerificationConflits = (demande: DemandeAffectation) => Promise<ConflictResult[]>;
  export interface Horloge { maintenant(): Date }
  ```

- [ ] **Step 1 : Écrire le domaine** (types, sans logique à tester hormis `idDeReference`, couverte par le test des cas d'usage en tâche 4)

```ts
// src/backend/operations/domain/operation.ts
import type { OperationStatus } from "@/shared/operations/statuts";
import type { QuantiteUnite } from "@/shared/operations/quantites";

/**
 * Relation vers un autre document : peuplée (les champs présents dépendent de la route),
 * identifiant brut (relation non peuplée), ou `null` (le document référencé n'existe plus).
 */
export type Reference<T> = T | string | null;

export interface ClientPeuple {
  id: string;
  nom?: string;
  contact?: { telephone?: string; email?: string };
}

export interface SitePeuple {
  id: string;
  nom?: string;
  adresse?: string;
  typeDechets?: string[];
}

export interface EquipePeuplee {
  id: string;
  nom?: string;
  membres?: string[];
}

export interface VehiculePeuple {
  id: string;
  identification?: string;
  type?: string;
}

export interface EquipementPeuple {
  id: string;
  nom?: string;
  type?: string;
}

export interface UtilisateurPeuple {
  id: string;
  nom?: string;
}

export interface EntreeHistorique {
  statut: OperationStatus;
  date: Date;
  parUtilisateur?: Reference<UtilisateurPeuple>;
  ancienStatut?: OperationStatus;
}

export interface PhotoOperation {
  url: string;
  nom: string;
  uploadedAt: Date;
}

export interface Operation {
  id: string;
  clientId: Reference<ClientPeuple>;
  siteId: Reference<SitePeuple>;
  natureIntervention: string;
  dateHeurePrevue: Date;
  dureeEstimeeMinutes: number;
  /** Absent : jamais affectée. `null` : l'équipe référencée a été supprimée. */
  equipeId?: Reference<EquipePeuplee>;
  vehiculeId?: Reference<VehiculePeuple>;
  equipementIds: (string | EquipementPeuple)[];
  informationsParticulieres: string;
  statut: OperationStatus;
  historiqueStatuts: EntreeHistorique[];
  quantiteCollectee?: number;
  uniteQuantite: QuantiteUnite;
  remarquesTerrain: string;
  nomSignataireClient: string;
  signatureClient: string;
  photos: PhotoOperation[];
  rapportPdf: string;
  createdAt?: Date;
  updatedAt?: Date;
  revision?: number;
}

/**
 * Sortie validée du formulaire d'opération. Les clés facultatives sont **absentes** (jamais
 * `undefined` explicite) quand le formulaire ne les fournit pas : à la modification, une clé
 * absente laisse la valeur stockée intacte.
 */
export interface OperationSaisie {
  clientId: string;
  siteId: string;
  natureIntervention: string;
  dateHeurePrevue: Date;
  dureeEstimeeMinutes: number;
  equipeId?: string;
  vehiculeId?: string;
  equipementIds: string[];
  informationsParticulieres: string;
  /** Ignoré à la création (statut initial calculé) ; appliqué tel quel à la modification. */
  statut?: OperationStatus;
  quantiteCollectee?: number;
  uniteQuantite: QuantiteUnite;
  remarquesTerrain: string;
  nomSignataireClient: string;
  signatureClient: string;
}

/** Première entrée de l'historique, posée à la création. */
export interface StatutInitial {
  statut: OperationStatus;
  date: Date;
  parUtilisateur: string;
}

/** Filtres transmis tels quels au dépôt (aucune validation : comportement historique). */
export interface FiltreOperations {
  clientId?: string;
  siteId?: string;
  equipeId?: string;
  vehiculeId?: string;
  statut?: string;
  /** Borne basse incluse. */
  dateDebut?: Date;
  /** Borne haute incluse. */
  dateFin?: Date;
}

export interface Pagination {
  skip: number;
  limit: number;
}

/** Identifiant porté par une relation, qu'elle soit peuplée ou non ; `null`/`undefined` conservés. */
export function idDeReference(reference: Reference<{ id: string }> | undefined): string | null | undefined {
  if (reference == null) return reference;
  return typeof reference === "string" ? reference : reference.id;
}
```

```ts
// src/backend/operations/domain/erreurs.ts
import type { ConflictResult } from "./conflits";
import { MESSAGE_CHAUFFEUR_SANS_EQUIPE } from "./visibilite";

/** Opération inexistante, ou hors du périmètre de l'acteur (indiscernables pour lui). */
export class OperationIntrouvable extends Error {
  constructor() {
    super("Non trouvé");
    this.name = "OperationIntrouvable";
  }
}

export class ChauffeurSansEquipe extends Error {
  constructor() {
    super(MESSAGE_CHAUFFEUR_SANS_EQUIPE);
    this.name = "ChauffeurSansEquipe";
  }
}

export class ConflitAffectation extends Error {
  constructor(readonly conflits: ConflictResult[]) {
    super("Conflit d'affectation");
    this.name = "ConflitAffectation";
  }
}
```

Ajouter à la fin de `src/backend/operations/domain/ports.ts` (et compléter ses imports) :

```ts
import type { AffectationExistante, ConflictResult, DemandeAffectation } from "./conflits";
import type { FiltreOperations, Operation, OperationSaisie, Pagination, StatutInitial } from "./operation";
```

```ts
export interface OperationRepository {
  /** Niveau « liste » (site avec adresse), triées par date prévue décroissante ; `total` ignore la pagination. */
  lister(filtre: FiltreOperations, pagination: Pagination): Promise<{ items: Operation[]; total: number }>;
  /** Niveau « résumé », sans tri. */
  listerPourPlanning(filtre: FiltreOperations): Promise<Operation[]>;
  /** Niveau « détail » (toutes les relations peuplées) ; null si l'opération n'existe pas. */
  trouverDetailParId(id: string): Promise<Operation | null>;
  /** Le `statut` de la saisie est remplacé par `initial.statut` ; niveau « résumé ». */
  creer(saisie: OperationSaisie, initial: StatutInitial): Promise<Operation>;
  /** Les clés absentes de la saisie ne sont pas modifiées ; null si l'opération n'existe pas ; niveau « résumé ». */
  modifier(id: string, saisie: OperationSaisie): Promise<Operation | null>;
  /** false si l'opération n'existait pas. */
  supprimer(id: string): Promise<boolean>;
}

/** Détection des conflits d'affectation (cas d'usage de R4a, injecté). */
export type VerificationConflits = (demande: DemandeAffectation) => Promise<ConflictResult[]>;

/** Port local, structurellement compatible avec `SystemClock` de `platform/horloge`. */
export interface Horloge {
  maintenant(): Date;
}
```

(La ligne `import type { AffectationExistante } from "./conflits";` existante est remplacée par le premier import ci-dessus.)

Run : `npx tsc --noEmit` → propre.

- [ ] **Step 2 : Test de contrat du dépôt (échec attendu)**

```ts
// src/backend/operations/infrastructure/mongoose/operation.repository.mongoose.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import mongoose from "mongoose";
import { Operation as OperationModel } from "./operation.model";
import { OperationRepositoryMongoose } from "./operation.repository.mongoose";
import type { OperationSaisie } from "../../domain/operation";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Site } from "@/backend/clients-sites/infrastructure/mongoose/site.model";
import { Equipe } from "@/backend/equipes/infrastructure/mongoose/equipe.model";
import { Vehicule } from "@/backend/vehicules/infrastructure/mongoose/vehicule.model";
import { Equipement } from "@/backend/equipements/infrastructure/mongoose/equipement.model";
import { User } from "@/backend/comptes/infrastructure/mongoose/utilisateur.model";

const MAINTENANT = new Date("2030-10-30T08:00:00.000Z");
const j = (jour: string) => new Date(`2030-11-${jour}T10:00:00.000Z`);

describe("OperationRepositoryMongoose (contrat)", () => {
  const depot = new OperationRepositoryMongoose();
  let userId: string;
  let clientId: string;
  let siteId: string;
  let equipeId: string;
  let vehiculeId: string;
  let equipementA: string;
  let equipementB: string;

  const saisie = (surcharge: Partial<OperationSaisie> = {}): OperationSaisie => ({
    clientId,
    siteId,
    natureIntervention: "Collecte",
    dateHeurePrevue: j("01"),
    dureeEstimeeMinutes: 120,
    equipementIds: [],
    informationsParticulieres: "",
    uniteQuantite: "Litres",
    remarquesTerrain: "",
    nomSignataireClient: "",
    signatureClient: "",
    ...surcharge,
  });

  const initial = (statut: "Planifiée" | "Affectée" = "Planifiée") => ({ statut, date: MAINTENANT, parUtilisateur: userId });

  beforeEach(async () => {
    const user = await User.create({ username: "admin", nom: "Admin Ops", email: "admin@srh.ci", motDePasseHash: "x", role: "admin" });
    const client = await Client.create({ nom: "Client A", contact: { telephone: "0102", email: "a@client.ci" } });
    const site = await Site.create({ clientId: client._id, nom: "Site A", adresse: "Rue 1", typeDechets: ["Huiles"] });
    const equipe = await Equipe.create({ nom: "Équipe A", membres: ["Ali"] });
    const vehicule = await Vehicule.create({ identification: "V-001", type: "Camion", capacite: 5 });
    const pompe = await Equipement.create({ nom: "Pompe", type: "Pompage" });
    const bac = await Equipement.create({ nom: "Bac", type: "Stockage" });
    userId = String(user._id);
    clientId = String(client._id);
    siteId = String(site._id);
    equipeId = String(equipe._id);
    vehiculeId = String(vehicule._id);
    equipementA = String(pompe._id);
    equipementB = String(bac._id);
  });

  describe("creer", () => {
    it("pose le statut initial et l'historique, ignore le statut de la saisie, renvoie le niveau résumé", async () => {
      const operation = await depot.creer(
        saisie({ equipeId, vehiculeId, equipementIds: [equipementA, equipementB], statut: "Terminée" }),
        initial("Affectée")
      );

      expect(operation).toEqual({
        id: expect.stringMatching(/^[a-f\d]{24}$/),
        clientId: { id: clientId, nom: "Client A" },
        siteId: { id: siteId, nom: "Site A" },
        natureIntervention: "Collecte",
        dateHeurePrevue: j("01"),
        dureeEstimeeMinutes: 120,
        equipeId: { id: equipeId, nom: "Équipe A" },
        vehiculeId: { id: vehiculeId, identification: "V-001" },
        equipementIds: [equipementA, equipementB],
        informationsParticulieres: "",
        statut: "Affectée",
        historiqueStatuts: [{ statut: "Affectée", date: MAINTENANT, parUtilisateur: userId }],
        uniteQuantite: "Litres",
        remarquesTerrain: "",
        nomSignataireClient: "",
        signatureClient: "",
        photos: [],
        rapportPdf: "",
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        revision: 0,
      });
    });

    it("sans équipe ni véhicule : les deux relations sont absentes (pas null)", async () => {
      const operation = await depot.creer(saisie(), initial());
      expect(operation.equipeId).toBeUndefined();
      expect(operation.vehiculeId).toBeUndefined();
      expect(operation.quantiteCollectee).toBeUndefined();
    });

    it("identifiant d'équipe vide : l'erreur Mongoose remonte", async () => {
      await expect(depot.creer(saisie({ equipeId: "" }), initial())).rejects.toThrow(/Cast to ObjectId failed/);
    });
  });

  describe("trouverDetailParId", () => {
    it("peuple toutes les relations en profondeur", async () => {
      const { id } = await depot.creer(
        saisie({ equipeId, vehiculeId, equipementIds: [equipementA, equipementB] }),
        initial("Affectée")
      );

      const operation = await depot.trouverDetailParId(id);

      expect(operation).toMatchObject({
        id,
        clientId: { id: clientId, nom: "Client A", contact: { telephone: "0102", email: "a@client.ci" } },
        siteId: { id: siteId, nom: "Site A", adresse: "Rue 1", typeDechets: ["Huiles"] },
        equipeId: { id: equipeId, nom: "Équipe A", membres: ["Ali"] },
        vehiculeId: { id: vehiculeId, identification: "V-001", type: "Camion" },
        equipementIds: [
          { id: equipementA, nom: "Pompe", type: "Pompage" },
          { id: equipementB, nom: "Bac", type: "Stockage" },
        ],
        historiqueStatuts: [{ statut: "Affectée", date: MAINTENANT, parUtilisateur: { id: userId, nom: "Admin Ops" } }],
      });
    });

    it("références pendantes : null réel (jamais la chaîne « null »), équipement supprimé retiré", async () => {
      const { id } = await depot.creer(
        saisie({ equipeId, vehiculeId, equipementIds: [equipementA, equipementB] }),
        initial("Affectée")
      );
      await Client.deleteOne({ _id: clientId });
      await Equipe.deleteOne({ _id: equipeId });
      await Equipement.deleteOne({ _id: equipementA });
      await User.deleteOne({ _id: userId });

      const operation = await depot.trouverDetailParId(id);

      expect(operation?.clientId).toBeNull();
      expect(operation?.equipeId).toBeNull();
      expect(operation?.vehiculeId).toEqual({ id: vehiculeId, identification: "V-001", type: "Camion" });
      expect(operation?.equipementIds).toEqual([{ id: equipementB, nom: "Bac", type: "Stockage" }]);
      expect(operation?.historiqueStatuts[0].parUtilisateur).toBeNull();
    });

    it("null si l'opération n'existe pas", async () => {
      expect(await depot.trouverDetailParId(String(new mongoose.Types.ObjectId()))).toBeNull();
    });

    it("données de terrain, photos et entrée d'historique sans auteur", async () => {
      const { id } = await depot.creer(saisie(), initial());
      await OperationModel.updateOne(
        { _id: id },
        {
          quantiteCollectee: 12.5,
          uniteQuantite: "Kg",
          photos: [{ url: "data:image/jpeg;base64,BBBB", nom: "cuve.jpg", uploadedAt: j("02") }],
          $push: { historiqueStatuts: { statut: "En route", date: j("01"), ancienStatut: "Planifiée" } },
        }
      );

      const operation = await depot.trouverDetailParId(id);

      expect(operation?.quantiteCollectee).toBe(12.5);
      expect(operation?.uniteQuantite).toBe("Kg");
      expect(operation?.photos).toEqual([{ url: "data:image/jpeg;base64,BBBB", nom: "cuve.jpg", uploadedAt: j("02") }]);
      expect(operation?.historiqueStatuts[1]).toEqual({ statut: "En route", date: j("01"), ancienStatut: "Planifiée" });
      expect(operation?.historiqueStatuts[1]).not.toHaveProperty("parUtilisateur");
    });
  });

  describe("lister", () => {
    it("niveau liste : site avec adresse, équipements et auteur d'historique en identifiants bruts", async () => {
      await depot.creer(saisie({ equipeId, vehiculeId, equipementIds: [equipementA] }), initial("Affectée"));

      const { items, total } = await depot.lister({}, { skip: 0, limit: 20 });

      expect(total).toBe(1);
      expect(items[0]).toMatchObject({
        clientId: { id: clientId, nom: "Client A" },
        siteId: { id: siteId, nom: "Site A", adresse: "Rue 1" },
        equipeId: { id: equipeId, nom: "Équipe A" },
        vehiculeId: { id: vehiculeId, identification: "V-001" },
        equipementIds: [equipementA],
        historiqueStatuts: [{ statut: "Affectée", date: MAINTENANT, parUtilisateur: userId }],
      });
      expect(items[0].siteId).not.toHaveProperty("typeDechets");
      expect(items[0].clientId).not.toHaveProperty("contact");
    });

    it("tri par date décroissante ; pagination ; total indépendant de la pagination", async () => {
      await depot.creer(saisie({ natureIntervention: "Première", dateHeurePrevue: j("01") }), initial());
      await depot.creer(saisie({ natureIntervention: "Troisième", dateHeurePrevue: j("03") }), initial());
      await depot.creer(saisie({ natureIntervention: "Deuxième", dateHeurePrevue: j("02") }), initial());

      const tout = await depot.lister({}, { skip: 0, limit: 20 });
      expect(tout.items.map((o) => o.natureIntervention)).toEqual(["Troisième", "Deuxième", "Première"]);

      const page2 = await depot.lister({}, { skip: 1, limit: 1 });
      expect(page2.items.map((o) => o.natureIntervention)).toEqual(["Deuxième"]);
      expect(page2.total).toBe(3);
    });

    it("limite nulle, négative ou NaN : toutes les opérations (comportement historique)", async () => {
      await depot.creer(saisie({ dateHeurePrevue: j("01") }), initial());
      await depot.creer(saisie({ dateHeurePrevue: j("02") }), initial());

      for (const pagination of [
        { skip: 0, limit: 0 },
        { skip: -0, limit: -5 },
        { skip: NaN, limit: NaN },
      ]) {
        expect((await depot.lister({}, pagination)).items).toHaveLength(2);
      }
    });

    it("filtres : relations, statut, bornes de date incluses", async () => {
      const autreEquipe = await Equipe.create({ nom: "Équipe B" });
      await depot.creer(saisie({ natureIntervention: "A", equipeId, vehiculeId, dateHeurePrevue: j("01") }), initial("Affectée"));
      await depot.creer(
        saisie({ natureIntervention: "B", equipeId: String(autreEquipe._id), dateHeurePrevue: j("05") }),
        initial()
      );

      const noms = async (filtre: Parameters<typeof depot.lister>[0]) =>
        (await depot.lister(filtre, { skip: 0, limit: 20 })).items.map((o) => o.natureIntervention);

      expect(await noms({ statut: "Affectée" })).toEqual(["A"]);
      expect(await noms({ statut: "Bidon" })).toEqual([]);
      expect(await noms({ equipeId: String(autreEquipe._id) })).toEqual(["B"]);
      expect(await noms({ vehiculeId })).toEqual(["A"]);
      expect(await noms({ clientId, siteId })).toEqual(["B", "A"]);
      expect(await noms({ dateDebut: j("05") })).toEqual(["B"]);
      expect(await noms({ dateFin: j("01") })).toEqual(["A"]);
      expect(await noms({ dateDebut: j("02"), dateFin: j("04") })).toEqual([]);
    });

    it("filtre illisible : l'erreur Mongoose remonte", async () => {
      await expect(depot.lister({ clientId: "abc" }, { skip: 0, limit: 20 })).rejects.toThrow(/Cast to ObjectId failed/);
      await expect(depot.lister({ dateDebut: new Date("bidon") }, { skip: 0, limit: 20 })).rejects.toThrow(
        /Cast to date failed/
      );
    });

    it("document écrit hors Mongoose : valeurs par défaut du schéma, relations facultatives absentes", async () => {
      await OperationModel.collection.insertOne({
        clientId: new mongoose.Types.ObjectId(clientId),
        siteId: new mongoose.Types.ObjectId(siteId),
        natureIntervention: "Import",
        dateHeurePrevue: j("05"),
        statut: "Planifiée",
      });

      const { items } = await depot.lister({}, { skip: 0, limit: 20 });

      expect(items[0]).toEqual({
        id: expect.any(String),
        clientId: { id: clientId, nom: "Client A" },
        siteId: { id: siteId, nom: "Site A", adresse: "Rue 1" },
        natureIntervention: "Import",
        dateHeurePrevue: j("05"),
        dureeEstimeeMinutes: 120,
        equipementIds: [],
        informationsParticulieres: "",
        statut: "Planifiée",
        historiqueStatuts: [],
        uniteQuantite: "Litres",
        remarquesTerrain: "",
        nomSignataireClient: "",
        signatureClient: "",
        photos: [],
        rapportPdf: "",
      });
    });
  });

  describe("listerPourPlanning", () => {
    it("niveau résumé (site sans adresse), filtre appliqué", async () => {
      await depot.creer(saisie({ natureIntervention: "A", equipeId, dateHeurePrevue: j("01") }), initial());
      await depot.creer(saisie({ natureIntervention: "B", dateHeurePrevue: j("05") }), initial());

      const toutes = await depot.listerPourPlanning({});
      expect(toutes.map((o) => o.natureIntervention).sort()).toEqual(["A", "B"]);
      expect(toutes[0].siteId).toEqual({ id: siteId, nom: "Site A" });

      expect((await depot.listerPourPlanning({ equipeId })).map((o) => o.natureIntervention)).toEqual(["A"]);
      expect((await depot.listerPourPlanning({ dateDebut: j("05") })).map((o) => o.natureIntervention)).toEqual(["B"]);
    });
  });

  describe("modifier", () => {
    it("une clé absente de la saisie laisse la valeur stockée intacte (équipe, véhicule, statut, quantité)", async () => {
      const { id } = await depot.creer(saisie({ equipeId, vehiculeId }), initial("Affectée"));
      await OperationModel.updateOne({ _id: id }, { quantiteCollectee: 12 });

      const operation = await depot.modifier(id, saisie({ natureIntervention: "Modifiée" }));

      expect(operation).toMatchObject({
        id,
        natureIntervention: "Modifiée",
        statut: "Affectée",
        quantiteCollectee: 12,
        clientId: { id: clientId, nom: "Client A" },
        siteId: { id: siteId, nom: "Site A" },
        equipeId: { id: equipeId, nom: "Équipe A" },
        vehiculeId: { id: vehiculeId, identification: "V-001" },
      });
      expect(operation?.historiqueStatuts).toHaveLength(1);
    });

    it("réécrit les clés présentes, y compris le statut, sans toucher à l'historique", async () => {
      const { id } = await depot.creer(saisie({ equipementIds: [equipementA] }), initial());
      await OperationModel.updateOne({ _id: id }, { remarquesTerrain: "RAS", uniteQuantite: "Kg" });

      const operation = await depot.modifier(id, saisie({ statut: "Rapportée", dateHeurePrevue: j("09") }));

      expect(operation).toMatchObject({
        statut: "Rapportée",
        dateHeurePrevue: j("09"),
        equipementIds: [],
        remarquesTerrain: "",
        uniteQuantite: "Litres",
      });
      expect(operation?.historiqueStatuts).toHaveLength(1);
    });

    it("null si l'opération n'existe pas", async () => {
      expect(await depot.modifier(String(new mongoose.Types.ObjectId()), saisie())).toBeNull();
    });
  });

  describe("supprimer", () => {
    it("true puis false", async () => {
      const { id } = await depot.creer(saisie(), initial());
      expect(await depot.supprimer(id)).toBe(true);
      expect(await depot.supprimer(id)).toBe(false);
      expect(await OperationModel.countDocuments()).toBe(0);
    });
  });
});
```

Run : `npx vitest run src/backend/operations/infrastructure/mongoose/operation.repository.mongoose.test.ts` → FAIL (module `./operation.repository.mongoose` introuvable).

- [ ] **Step 3 : Écrire le dépôt**

```ts
// src/backend/operations/infrastructure/mongoose/operation.repository.mongoose.ts
import mongoose from "mongoose";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type { OperationStatus } from "@/shared/operations/statuts";
import type { QuantiteUnite } from "@/shared/operations/quantites";
import type {
  EntreeHistorique,
  EquipePeuplee,
  EquipementPeuple,
  FiltreOperations,
  Operation,
  OperationSaisie,
  Pagination,
  PhotoOperation,
  Reference,
  StatutInitial,
  VehiculePeuple,
} from "../../domain/operation";
import type { OperationRepository } from "../../domain/ports";
import { Operation as OperationModel } from "./operation.model";

/** Document tel que renvoyé par `.lean()` : chaque relation est un ObjectId, un document peuplé ou `null`. */
interface DocumentOperation {
  _id: unknown;
  clientId?: unknown;
  siteId?: unknown;
  natureIntervention: string;
  dateHeurePrevue: Date;
  dureeEstimeeMinutes?: number;
  equipeId?: unknown;
  vehiculeId?: unknown;
  equipementIds?: unknown[];
  informationsParticulieres?: string;
  statut?: OperationStatus;
  historiqueStatuts?: { statut: OperationStatus; date: Date; parUtilisateur?: unknown; ancienStatut?: OperationStatus }[];
  quantiteCollectee?: number;
  uniteQuantite?: QuantiteUnite;
  remarquesTerrain?: string;
  nomSignataireClient?: string;
  signatureClient?: string;
  photos?: { url: string; nom?: string; uploadedAt: Date }[];
  rapportPdf?: string;
  createdAt?: Date;
  updatedAt?: Date;
  __v?: number;
}

type Peuplement = { path: string; select: string };

// Champs sélectionnés par relation, repris à l'identique des routes d'origine.
const RESUME: Peuplement[] = [
  { path: "clientId", select: "nom" },
  { path: "siteId", select: "nom" },
  { path: "equipeId", select: "nom" },
  { path: "vehiculeId", select: "identification" },
];

const LISTE: Peuplement[] = [
  { path: "clientId", select: "nom" },
  { path: "siteId", select: "nom adresse" },
  { path: "equipeId", select: "nom" },
  { path: "vehiculeId", select: "identification" },
];

const DETAIL: Peuplement[] = [
  { path: "clientId", select: "nom contact" },
  { path: "siteId", select: "nom adresse typeDechets" },
  { path: "equipeId", select: "nom membres" },
  { path: "vehiculeId", select: "identification type" },
  { path: "equipementIds", select: "nom type" },
  { path: "historiqueStatuts.parUtilisateur", select: "nom" },
];

/**
 * Trois issues (leçon R2) : `null`/absent → `null` (référence pendante), ObjectId → identifiant
 * brut, document peuplé → `{ id, ...champs sélectionnés }` (seuls les champs réellement présents).
 */
function versReference<T extends { id: string }>(valeur: unknown): Reference<T> {
  if (valeur == null) return null;
  if (valeur instanceof mongoose.Types.ObjectId || typeof valeur !== "object") return String(valeur);
  const { _id, ...champs } = valeur as { _id: unknown } & Record<string, unknown>;
  return { id: String(_id), ...champs } as unknown as T;
}

/** Relation facultative : absente du document → absente de l'entité (pas `null`). */
function versReferenceFacultative<T extends { id: string }>(valeur: unknown): Reference<T> | undefined {
  return valeur === undefined ? undefined : versReference<T>(valeur);
}

function versEntree(entree: NonNullable<DocumentOperation["historiqueStatuts"]>[number]): EntreeHistorique {
  const resultat: EntreeHistorique = { statut: entree.statut, date: entree.date };
  if (entree.parUtilisateur !== undefined) resultat.parUtilisateur = versReference(entree.parUtilisateur);
  if (entree.ancienStatut !== undefined) resultat.ancienStatut = entree.ancienStatut;
  return resultat;
}

function versPhoto(photo: NonNullable<DocumentOperation["photos"]>[number]): PhotoOperation {
  return { url: photo.url, nom: photo.nom ?? "", uploadedAt: photo.uploadedAt };
}

function versEntite(doc: DocumentOperation): Operation {
  const operation: Operation = {
    id: String(doc._id),
    clientId: versReference(doc.clientId),
    siteId: versReference(doc.siteId),
    natureIntervention: doc.natureIntervention,
    dateHeurePrevue: doc.dateHeurePrevue,
    dureeEstimeeMinutes: doc.dureeEstimeeMinutes ?? 120,
    // Un équipement supprimé a déjà été retiré du tableau par `.populate()`.
    equipementIds: (doc.equipementIds ?? []).map((equipement) => versReference<EquipementPeuple>(equipement) as string | EquipementPeuple),
    informationsParticulieres: doc.informationsParticulieres ?? "",
    statut: doc.statut ?? "Planifiée",
    historiqueStatuts: (doc.historiqueStatuts ?? []).map(versEntree),
    uniteQuantite: doc.uniteQuantite ?? "Litres",
    remarquesTerrain: doc.remarquesTerrain ?? "",
    nomSignataireClient: doc.nomSignataireClient ?? "",
    signatureClient: doc.signatureClient ?? "",
    photos: (doc.photos ?? []).map(versPhoto),
    rapportPdf: doc.rapportPdf ?? "",
  };
  // Champs facultatifs : la clé n'existe que si la valeur existe (les tests comparent les clés).
  const equipe = versReferenceFacultative<EquipePeuplee>(doc.equipeId);
  if (equipe !== undefined) operation.equipeId = equipe;
  const vehicule = versReferenceFacultative<VehiculePeuple>(doc.vehiculeId);
  if (vehicule !== undefined) operation.vehiculeId = vehicule;
  if (doc.quantiteCollectee !== undefined) operation.quantiteCollectee = doc.quantiteCollectee;
  if (doc.createdAt !== undefined) operation.createdAt = doc.createdAt;
  if (doc.updatedAt !== undefined) operation.updatedAt = doc.updatedAt;
  if (doc.__v !== undefined) operation.revision = doc.__v;
  return operation;
}

/** Filtre Mongo : mêmes clés et mêmes valeurs brutes que les routes d'origine (aucune conversion). */
function versFiltreMongo(filtre: FiltreOperations): Record<string, unknown> {
  const mongo: Record<string, unknown> = {};
  if (filtre.clientId) mongo.clientId = filtre.clientId;
  if (filtre.siteId) mongo.siteId = filtre.siteId;
  if (filtre.equipeId) mongo.equipeId = filtre.equipeId;
  if (filtre.vehiculeId) mongo.vehiculeId = filtre.vehiculeId;
  if (filtre.statut) mongo.statut = filtre.statut;
  if (filtre.dateDebut || filtre.dateFin) {
    const bornes: Record<string, Date> = {};
    if (filtre.dateDebut) bornes.$gte = filtre.dateDebut;
    if (filtre.dateFin) bornes.$lte = filtre.dateFin;
    mongo.dateHeurePrevue = bornes;
  }
  return mongo;
}

export class OperationRepositoryMongoose implements OperationRepository {
  async lister(filtre: FiltreOperations, { skip, limit }: Pagination): Promise<{ items: Operation[]; total: number }> {
    await connectDB();
    const mongo = versFiltreMongo(filtre);
    const [docs, total] = await Promise.all([
      OperationModel.find(mongo).populate(LISTE).sort({ dateHeurePrevue: -1 }).skip(skip).limit(limit).lean(),
      OperationModel.countDocuments(mongo),
    ]);
    return { items: (docs as unknown as DocumentOperation[]).map(versEntite), total };
  }

  async listerPourPlanning(filtre: FiltreOperations): Promise<Operation[]> {
    await connectDB();
    const docs = await OperationModel.find(versFiltreMongo(filtre)).populate(RESUME).lean();
    return (docs as unknown as DocumentOperation[]).map(versEntite);
  }

  async trouverDetailParId(id: string): Promise<Operation | null> {
    await connectDB();
    const doc = (await OperationModel.findById(id).populate(DETAIL).lean()) as unknown as DocumentOperation | null;
    return doc ? versEntite(doc) : null;
  }

  async creer(saisie: OperationSaisie, initial: StatutInitial): Promise<Operation> {
    await connectDB();
    const cree = await OperationModel.create({
      ...saisie,
      statut: initial.statut,
      historiqueStatuts: [
        {
          statut: initial.statut,
          date: initial.date,
          parUtilisateur: new mongoose.Types.ObjectId(initial.parUtilisateur),
        },
      ],
    });
    const doc = (await OperationModel.findById(cree._id).populate(RESUME).lean()) as unknown as DocumentOperation;
    return versEntite(doc);
  }

  async modifier(id: string, saisie: OperationSaisie): Promise<Operation | null> {
    await connectDB();
    const doc = (await OperationModel.findByIdAndUpdate(id, saisie, { new: true })
      .populate(RESUME)
      .lean()) as unknown as DocumentOperation | null;
    return doc ? versEntite(doc) : null;
  }

  async supprimer(id: string): Promise<boolean> {
    await connectDB();
    return Boolean(await OperationModel.findByIdAndDelete(id));
  }
}
```

- [ ] **Step 4 : Vérifier**

Run : `npx vitest run src/backend/operations/infrastructure/mongoose/operation.repository.mongoose.test.ts` → PASS (**18 tests**).

Si un test échoue, **corriger le dépôt, pas le test** : chaque assertion reproduit un fait de la sonde. Deux pièges connus : (1) `toEqual` ignore les clés à valeur `undefined`, mais `not.toHaveProperty` non — d'où les affectations conditionnelles de `versEntite` ; (2) si le test « une clé absente de la saisie laisse la valeur stockée intacte » échoue, c'est que la saisie contient une clé `equipeId: undefined` : la fabrique `saisie()` du test n'en pose pas, vérifier qu'aucun `...` n'en introduit.

- [ ] **Step 5 : Vérification et commit**

Run : `npx tsc --noEmit && npm run lint && npx vitest run` → vert, **1075 tests**.

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!data' ':!package.json'
git status
git commit -m "refactor(operations): entité Operation, erreurs métier, port OperationRepository et adaptateur Mongoose"
```

---

### Task 4 : Cas d'usage

**Files:**
- Create: `src/backend/operations/infrastructure/en-memoire/operation.repository.en-memoire.ts`, `src/backend/operations/application/cas-d-usage.ts`, `src/backend/operations/application/cas-d-usage.test.ts`
- Modify: `src/backend/operations/composition.ts`

**Interfaces:**
- Consomme : tâche 3 (`Operation`, `OperationSaisie`, `FiltreOperations`, `Pagination`, `idDeReference`, erreurs, `OperationRepository`, `VerificationConflits`, `Horloge`) ; R4a (`chauffeurSansEquipe`, `perimetreDeLecture`, `peutVoirOperation`, `finPrevue`, `computeEffectiveStatus`).
- Produit :
  ```ts
  // application/cas-d-usage.ts
  export interface ElementPlanning { operation: Operation; statutEffectif: OperationStatus; fin: Date }
  export interface DependancesOperations { operations: OperationRepository; verifierConflits: VerificationConflits; horloge: Horloge }
  export function creerCasDUsageOperations(deps: DependancesOperations): {
    verifierAccesLecture(acteur: Acteur): void;                                          // lève ChauffeurSansEquipe
    lister(acteur: Acteur, filtre: FiltreOperations, pagination: Pagination): Promise<{ items: Operation[]; total: number }>;
    obtenir(acteur: Acteur, id: string): Promise<Operation>;                              // lève OperationIntrouvable
    creer(acteur: Acteur, saisie: OperationSaisie): Promise<Operation>;                   // lève ConflitAffectation
    modifier(id: string, saisie: OperationSaisie): Promise<Operation>;                    // lève ConflitAffectation, OperationIntrouvable
    supprimer(id: string): Promise<void>;                                                 // lève OperationIntrouvable
    planning(acteur: Acteur, filtre: FiltreOperations): Promise<ElementPlanning[]>;
  };
  // composition.ts
  export const casDUsageOperations: ReturnType<typeof creerCasDUsageOperations>;
  ```
  Le droit d'écriture (`admin`/`dispatcher`) reste vérifié par `requireAuth(true)` dans le contrôleur, comme dans tous les domaines déjà migrés.

- [ ] **Step 1 : Faux en mémoire**

```ts
// src/backend/operations/infrastructure/en-memoire/operation.repository.en-memoire.ts
import {
  idDeReference,
  type FiltreOperations,
  type Operation,
  type OperationSaisie,
  type Pagination,
  type StatutInitial,
} from "../../domain/operation";
import type { OperationRepository } from "../../domain/ports";

/** Dépôt en mémoire : sert aux tests des cas d'usage. Les relations y restent des identifiants bruts. */
export class OperationRepositoryEnMemoire implements OperationRepository {
  private readonly donnees = new Map<string, Operation>();
  private compteur = 0;
  /** Filtres reçus par `lister` et `listerPourPlanning`, dans l'ordre des appels. */
  readonly filtresRecus: FiltreOperations[] = [];

  /** Insère une opération telle quelle (pour préparer un état : relation peuplée, pendante…). */
  deposer(operation: Operation): void {
    this.donnees.set(operation.id, operation);
  }

  private filtrer(filtre: FiltreOperations): Operation[] {
    return [...this.donnees.values()].filter(
      (op) =>
        (!filtre.clientId || idDeReference(op.clientId) === filtre.clientId) &&
        (!filtre.siteId || idDeReference(op.siteId) === filtre.siteId) &&
        (!filtre.equipeId || idDeReference(op.equipeId) === filtre.equipeId) &&
        (!filtre.vehiculeId || idDeReference(op.vehiculeId) === filtre.vehiculeId) &&
        (!filtre.statut || op.statut === filtre.statut) &&
        (!filtre.dateDebut || op.dateHeurePrevue >= filtre.dateDebut) &&
        (!filtre.dateFin || op.dateHeurePrevue <= filtre.dateFin)
    );
  }

  async lister(filtre: FiltreOperations, { skip, limit }: Pagination): Promise<{ items: Operation[]; total: number }> {
    this.filtresRecus.push(filtre);
    const tries = this.filtrer(filtre).sort((a, b) => b.dateHeurePrevue.getTime() - a.dateHeurePrevue.getTime());
    return { items: tries.slice(skip, skip + limit), total: tries.length };
  }

  async listerPourPlanning(filtre: FiltreOperations): Promise<Operation[]> {
    this.filtresRecus.push(filtre);
    return this.filtrer(filtre);
  }

  async trouverDetailParId(id: string): Promise<Operation | null> {
    return this.donnees.get(id) ?? null;
  }

  async creer(saisie: OperationSaisie, initial: StatutInitial): Promise<Operation> {
    this.compteur += 1;
    const operation: Operation = {
      photos: [],
      rapportPdf: "",
      ...saisie,
      id: `operation-${this.compteur}`,
      statut: initial.statut,
      historiqueStatuts: [{ statut: initial.statut, date: initial.date, parUtilisateur: initial.parUtilisateur }],
      createdAt: initial.date,
      updatedAt: initial.date,
      revision: 0,
    };
    this.donnees.set(operation.id, operation);
    return operation;
  }

  async modifier(id: string, saisie: OperationSaisie): Promise<Operation | null> {
    const existante = this.donnees.get(id);
    if (!existante) return null;
    const modifiee: Operation = { ...existante, ...saisie };
    this.donnees.set(id, modifiee);
    return modifiee;
  }

  async supprimer(id: string): Promise<boolean> {
    return this.donnees.delete(id);
  }
}
```

- [ ] **Step 2 : Test des cas d'usage (échec attendu)**

```ts
// src/backend/operations/application/cas-d-usage.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import type { Acteur } from "@/shared/acces/acteur";
import type { ConflictResult, DemandeAffectation } from "../domain/conflits";
import { ChauffeurSansEquipe, ConflitAffectation, OperationIntrouvable } from "../domain/erreurs";
import type { Operation, OperationSaisie } from "../domain/operation";
import { OperationRepositoryEnMemoire } from "../infrastructure/en-memoire/operation.repository.en-memoire";
import { creerCasDUsageOperations } from "./cas-d-usage";

const MAINTENANT = new Date("2030-11-01T12:00:00.000Z");
const PAGE = { skip: 0, limit: 20 };

const admin: Acteur = { id: "u-admin", role: "admin" };
const compteClient: Acteur = { id: "u-client", role: "client", clientId: "client-a" };
const chauffeur: Acteur = { id: "u-chauffeur", role: "chauffeur", equipeId: "equipe-a" };
const chauffeurSansEquipe: Acteur = { id: "u-chauffeur", role: "chauffeur" };

const saisie = (surcharge: Partial<OperationSaisie> = {}): OperationSaisie => ({
  clientId: "client-a",
  siteId: "site-a",
  natureIntervention: "Collecte",
  dateHeurePrevue: new Date("2030-11-02T10:00:00.000Z"),
  dureeEstimeeMinutes: 90,
  equipementIds: [],
  informationsParticulieres: "",
  uniteQuantite: "Litres",
  remarquesTerrain: "",
  nomSignataireClient: "",
  signatureClient: "",
  ...surcharge,
});

const CONFLIT: ConflictResult = {
  hasConflict: true,
  message: "L'équipe est déjà affectée à une opération sur ce créneau",
  conflictingOperationId: "operation-9",
};

describe("cas d'usage des opérations", () => {
  let operations: OperationRepositoryEnMemoire;
  let demandes: DemandeAffectation[];
  let conflits: ConflictResult[];
  let casDUsage: ReturnType<typeof creerCasDUsageOperations>;

  const deposer = (surcharge: Partial<Operation>): Operation => {
    const operation: Operation = {
      id: "operation-x",
      clientId: "client-a",
      siteId: "site-a",
      natureIntervention: "Collecte",
      dateHeurePrevue: new Date("2030-11-02T10:00:00.000Z"),
      dureeEstimeeMinutes: 120,
      equipementIds: [],
      informationsParticulieres: "",
      statut: "Planifiée",
      historiqueStatuts: [],
      uniteQuantite: "Litres",
      remarquesTerrain: "",
      nomSignataireClient: "",
      signatureClient: "",
      photos: [],
      rapportPdf: "",
      ...surcharge,
    };
    operations.deposer(operation);
    return operation;
  };

  beforeEach(() => {
    operations = new OperationRepositoryEnMemoire();
    demandes = [];
    conflits = [];
    casDUsage = creerCasDUsageOperations({
      operations,
      verifierConflits: async (demande) => {
        demandes.push(demande);
        return conflits;
      },
      horloge: { maintenant: () => MAINTENANT },
    });
  });

  describe("verifierAccesLecture", () => {
    it("refuse un chauffeur sans équipe, laisse passer les autres", () => {
      expect(() => casDUsage.verifierAccesLecture(chauffeurSansEquipe)).toThrow(ChauffeurSansEquipe);
      expect(() => casDUsage.verifierAccesLecture(chauffeurSansEquipe)).toThrow("Compte chauffeur sans équipe attribuée");
      for (const acteur of [admin, compteClient, chauffeur]) {
        expect(() => casDUsage.verifierAccesLecture(acteur)).not.toThrow();
      }
    });
  });

  describe("lister", () => {
    it("un chauffeur sans équipe est refusé avant toute lecture", async () => {
      await expect(casDUsage.lister(chauffeurSansEquipe, {}, PAGE)).rejects.toThrow(ChauffeurSansEquipe);
      expect(operations.filtresRecus).toHaveLength(0);
    });

    it("un rôle interne garde les filtres demandés", async () => {
      await casDUsage.lister(admin, { clientId: "client-b", equipeId: "equipe-b", statut: "Affectée" }, PAGE);
      expect(operations.filtresRecus).toEqual([{ clientId: "client-b", equipeId: "equipe-b", statut: "Affectée" }]);
    });

    it("le périmètre d'un compte client écrase le client demandé", async () => {
      await casDUsage.lister(compteClient, { clientId: "client-b", statut: "Affectée" }, PAGE);
      expect(operations.filtresRecus).toEqual([{ clientId: "client-a", statut: "Affectée" }]);
    });

    it("le périmètre d'un chauffeur écrase l'équipe demandée", async () => {
      await casDUsage.lister(chauffeur, { equipeId: "equipe-b" }, PAGE);
      expect(operations.filtresRecus).toEqual([{ equipeId: "equipe-a" }]);
    });

    it("renvoie les éléments et le total du dépôt", async () => {
      deposer({ id: "operation-1" });
      deposer({ id: "operation-2", clientId: "client-b" });
      const resultat = await casDUsage.lister(compteClient, {}, PAGE);
      expect(resultat.items.map((o) => o.id)).toEqual(["operation-1"]);
      expect(resultat.total).toBe(1);
    });
  });

  describe("obtenir", () => {
    it("introuvable : OperationIntrouvable « Non trouvé »", async () => {
      await expect(casDUsage.obtenir(admin, "absente")).rejects.toThrow(OperationIntrouvable);
      await expect(casDUsage.obtenir(admin, "absente")).rejects.toThrow("Non trouvé");
    });

    it("chauffeur sans équipe : refusé avant la lecture", async () => {
      deposer({ id: "operation-1" });
      await expect(casDUsage.obtenir(chauffeurSansEquipe, "operation-1")).rejects.toThrow(ChauffeurSansEquipe);
    });

    it("relations peuplées : le périmètre se lit sur l'identifiant de la relation", async () => {
      deposer({
        id: "operation-1",
        clientId: { id: "client-a", nom: "Client A" },
        equipeId: { id: "equipe-a", nom: "Équipe A" },
      });
      expect((await casDUsage.obtenir(compteClient, "operation-1")).id).toBe("operation-1");
      expect((await casDUsage.obtenir(chauffeur, "operation-1")).id).toBe("operation-1");
      expect((await casDUsage.obtenir(admin, "operation-1")).id).toBe("operation-1");
    });

    it.each([
      ["autre client", compteClient, { clientId: "client-b" }],
      ["client supprimé (référence pendante)", compteClient, { clientId: null }],
      ["autre équipe", chauffeur, { equipeId: "equipe-b" }],
      ["opération sans équipe", chauffeur, {}],
      ["équipe supprimée (référence pendante)", chauffeur, { equipeId: null }],
    ] as const)("hors périmètre (%s) : indiscernable d'une opération inexistante", async (_cas, acteur, surcharge) => {
      deposer({ id: "operation-1", ...surcharge });
      await expect(casDUsage.obtenir(acteur, "operation-1")).rejects.toThrow(OperationIntrouvable);
    });
  });

  describe("creer", () => {
    it.each([
      [{ equipeId: "equipe-a", vehiculeId: "vehicule-a" }, "Affectée"],
      [{ equipeId: "equipe-a" }, "Planifiée"],
      [{ vehiculeId: "vehicule-a" }, "Planifiée"],
      [{}, "Planifiée"],
      [{ equipeId: "", vehiculeId: "vehicule-a" }, "Planifiée"],
    ] as const)("statut initial pour %j : %s", async (ressources, attendu) => {
      const operation = await casDUsage.creer(admin, saisie(ressources));
      expect(operation.statut).toBe(attendu);
    });

    it("première entrée d'historique : statut initial, heure de l'horloge, acteur", async () => {
      const operation = await casDUsage.creer(admin, saisie({ equipeId: "equipe-a", vehiculeId: "vehicule-a" }));
      expect(operation.historiqueStatuts).toEqual([{ statut: "Affectée", date: MAINTENANT, parUtilisateur: "u-admin" }]);
    });

    it("le statut de la saisie est ignoré", async () => {
      expect((await casDUsage.creer(admin, saisie({ statut: "Terminée" }))).statut).toBe("Planifiée");
    });

    it("demande de conflit : créneau et ressources de la saisie, sans opération à exclure", async () => {
      await casDUsage.creer(admin, saisie({ equipeId: "equipe-a", vehiculeId: "vehicule-a" }));
      expect(demandes).toEqual([
        {
          dateHeurePrevue: new Date("2030-11-02T10:00:00.000Z"),
          dureeEstimeeMinutes: 90,
          equipeId: "equipe-a",
          vehiculeId: "vehicule-a",
        },
      ]);
    });

    it("conflit : ConflitAffectation porte les conflits, rien n'est créé", async () => {
      conflits = [CONFLIT];
      const tentative = casDUsage.creer(admin, saisie({ equipeId: "equipe-a" }));
      await expect(tentative).rejects.toThrow(ConflitAffectation);
      await expect(tentative).rejects.toMatchObject({ message: "Conflit d'affectation", conflits: [CONFLIT] });
      expect((await casDUsage.lister(admin, {}, PAGE)).total).toBe(0);
    });

    it("un résultat sans conflit effectif ne bloque pas", async () => {
      conflits = [{ hasConflict: false }];
      await expect(casDUsage.creer(admin, saisie())).resolves.toMatchObject({ statut: "Planifiée" });
    });
  });

  describe("modifier", () => {
    it("exclut l'opération elle-même de la recherche de conflits", async () => {
      deposer({ id: "operation-1" });
      await casDUsage.modifier("operation-1", saisie({ equipeId: "equipe-a" }));
      expect(demandes).toEqual([
        {
          dateHeurePrevue: new Date("2030-11-02T10:00:00.000Z"),
          dureeEstimeeMinutes: 90,
          equipeId: "equipe-a",
          vehiculeId: undefined,
          excludeOperationId: "operation-1",
        },
      ]);
    });

    it("le conflit est signalé avant de savoir si l'opération existe", async () => {
      conflits = [CONFLIT];
      await expect(casDUsage.modifier("absente", saisie({ equipeId: "equipe-a" }))).rejects.toThrow(ConflitAffectation);
    });

    it("introuvable : OperationIntrouvable", async () => {
      await expect(casDUsage.modifier("absente", saisie())).rejects.toThrow(OperationIntrouvable);
    });

    it("renvoie l'opération modifiée ; le statut n'est pas recalculé", async () => {
      deposer({ id: "operation-1", statut: "Planifiée" });
      const operation = await casDUsage.modifier(
        "operation-1",
        saisie({ natureIntervention: "Modifiée", equipeId: "equipe-a", vehiculeId: "vehicule-a" })
      );
      expect(operation).toMatchObject({ id: "operation-1", natureIntervention: "Modifiée", statut: "Planifiée" });
    });
  });

  describe("supprimer", () => {
    it("supprime, puis OperationIntrouvable", async () => {
      deposer({ id: "operation-1" });
      await expect(casDUsage.supprimer("operation-1")).resolves.toBeUndefined();
      await expect(casDUsage.supprimer("operation-1")).rejects.toThrow(OperationIntrouvable);
    });
  });

  describe("planning", () => {
    it("un chauffeur sans équipe est refusé", async () => {
      await expect(casDUsage.planning(chauffeurSansEquipe, {})).rejects.toThrow(ChauffeurSansEquipe);
    });

    it("applique le périmètre et les bornes de date demandées", async () => {
      const dateDebut = new Date("2030-11-01T00:00:00.000Z");
      await casDUsage.planning(chauffeur, { dateDebut });
      await casDUsage.planning(compteClient, {});
      expect(operations.filtresRecus).toEqual([{ dateDebut, equipeId: "equipe-a" }, { clientId: "client-a" }]);
    });

    it("statut effectif selon l'horloge, fin = début + durée", async () => {
      deposer({ id: "passee", dateHeurePrevue: new Date("2030-11-01T11:59:59.999Z"), dureeEstimeeMinutes: 30 });
      deposer({ id: "maintenant", dateHeurePrevue: new Date(MAINTENANT) });
      deposer({ id: "terminee", dateHeurePrevue: new Date("2030-10-01T10:00:00.000Z"), statut: "Terminée" });

      const elements = await casDUsage.planning(admin, {});
      const parId = Object.fromEntries(elements.map((e) => [e.operation.id, e]));

      expect(parId.passee.statutEffectif).toBe("Retardée");
      expect(parId.passee.fin).toEqual(new Date("2030-11-01T12:29:59.999Z"));
      expect(parId.maintenant.statutEffectif).toBe("Planifiée");
      expect(parId.maintenant.fin).toEqual(new Date("2030-11-01T14:00:00.000Z"));
      expect(parId.terminee.statutEffectif).toBe("Terminée");
      expect(parId.passee.operation.statut).toBe("Planifiée");
    });
  });
});
```

Run : `npx vitest run src/backend/operations/application/cas-d-usage.test.ts` → FAIL (module `./cas-d-usage` introuvable).

- [ ] **Step 3 : Écrire les cas d'usage**

```ts
// src/backend/operations/application/cas-d-usage.ts
import type { Acteur } from "@/shared/acces/acteur";
import type { OperationStatus } from "@/shared/operations/statuts";
import { finPrevue } from "../domain/conflits";
import { ChauffeurSansEquipe, ConflitAffectation, OperationIntrouvable } from "../domain/erreurs";
import {
  idDeReference,
  type FiltreOperations,
  type Operation,
  type OperationSaisie,
  type Pagination,
} from "../domain/operation";
import type { Horloge, OperationRepository, VerificationConflits } from "../domain/ports";
import { computeEffectiveStatus } from "../domain/statut-effectif";
import { chauffeurSansEquipe, perimetreDeLecture, peutVoirOperation } from "../domain/visibilite";

export interface DependancesOperations {
  operations: OperationRepository;
  verifierConflits: VerificationConflits;
  horloge: Horloge;
}

/** Une opération telle que le planning la montre : statut calculé à l'affichage, heure de fin. */
export interface ElementPlanning {
  operation: Operation;
  statutEffectif: OperationStatus;
  fin: Date;
}

export function creerCasDUsageOperations({ operations, verifierConflits, horloge }: DependancesOperations) {
  function verifierAccesLecture(acteur: Acteur): void {
    if (chauffeurSansEquipe(acteur)) throw new ChauffeurSansEquipe();
  }

  /** Le périmètre de l'acteur l'emporte sur les filtres qu'il a demandés. */
  function dansLePerimetre(acteur: Acteur, filtre: FiltreOperations): FiltreOperations {
    return { ...filtre, ...perimetreDeLecture(acteur) };
  }

  return {
    verifierAccesLecture,

    async lister(
      acteur: Acteur,
      filtre: FiltreOperations,
      pagination: Pagination
    ): Promise<{ items: Operation[]; total: number }> {
      verifierAccesLecture(acteur);
      return operations.lister(dansLePerimetre(acteur, filtre), pagination);
    },

    async obtenir(acteur: Acteur, id: string): Promise<Operation> {
      verifierAccesLecture(acteur);
      const operation = await operations.trouverDetailParId(id);
      if (!operation) throw new OperationIntrouvable();
      const rattachements = {
        clientId: idDeReference(operation.clientId),
        equipeId: idDeReference(operation.equipeId),
      };
      // Hors périmètre : même réponse qu'une opération inexistante.
      if (!peutVoirOperation(acteur, rattachements)) throw new OperationIntrouvable();
      return operation;
    },

    async creer(acteur: Acteur, saisie: OperationSaisie): Promise<Operation> {
      const conflits = await verifierConflits({
        dateHeurePrevue: saisie.dateHeurePrevue,
        dureeEstimeeMinutes: saisie.dureeEstimeeMinutes,
        equipeId: saisie.equipeId,
        vehiculeId: saisie.vehiculeId,
      });
      if (conflits.some((conflit) => conflit.hasConflict)) throw new ConflitAffectation(conflits);

      const statut: OperationStatus = saisie.equipeId && saisie.vehiculeId ? "Affectée" : "Planifiée";
      return operations.creer(saisie, { statut, date: horloge.maintenant(), parUtilisateur: acteur.id });
    },

    async modifier(id: string, saisie: OperationSaisie): Promise<Operation> {
      // Le conflit est cherché avant de savoir si l'opération existe (ordre historique : 409 avant 404).
      const conflits = await verifierConflits({
        dateHeurePrevue: saisie.dateHeurePrevue,
        dureeEstimeeMinutes: saisie.dureeEstimeeMinutes,
        equipeId: saisie.equipeId,
        vehiculeId: saisie.vehiculeId,
        excludeOperationId: id,
      });
      if (conflits.some((conflit) => conflit.hasConflict)) throw new ConflitAffectation(conflits);

      const operation = await operations.modifier(id, saisie);
      if (!operation) throw new OperationIntrouvable();
      return operation;
    },

    async supprimer(id: string): Promise<void> {
      if (!(await operations.supprimer(id))) throw new OperationIntrouvable();
    },

    async planning(acteur: Acteur, filtre: FiltreOperations): Promise<ElementPlanning[]> {
      verifierAccesLecture(acteur);
      const trouvees = await operations.listerPourPlanning(dansLePerimetre(acteur, filtre));
      const maintenant = horloge.maintenant();
      return trouvees.map((operation) => ({
        operation,
        statutEffectif: computeEffectiveStatus(operation.statut, operation.dateHeurePrevue, maintenant),
        fin: finPrevue(operation.dateHeurePrevue, operation.dureeEstimeeMinutes),
      }));
    },
  };
}

export type CasDUsageOperations = ReturnType<typeof creerCasDUsageOperations>;
```

Note sur le test « applique le périmètre » : `perimetreDeLecture(compteClient)` renvoie `{ clientId: "client-a" }` et, pour un rôle interne, `{}` — d'où l'égalité stricte des filtres reçus.

Note sur le test « demande de conflit » de `creer` : l'objet transmis porte toujours les clés `equipeId` et `vehiculeId` (valeur `undefined` si absentes de la saisie) ; `toEqual` ne distingue pas une clé `undefined` d'une clé absente, les deux assertions passent donc telles qu'écrites.

Run : `npx vitest run src/backend/operations/application/cas-d-usage.test.ts` → PASS (**32 tests**).

- [ ] **Step 4 : Composition**

`src/backend/operations/composition.ts` devient :

```ts
import { SystemClock } from "@/backend/platform/horloge/horloge";
import { creerCasDUsageOperations } from "./application/cas-d-usage";
import { creerVerificationConflits } from "./application/verifier-conflits";
import { AffectationsMongoose } from "./infrastructure/mongoose/affectations.mongoose";
import { OperationRepositoryMongoose } from "./infrastructure/mongoose/operation.repository.mongoose";

export const checkAssignmentConflicts = creerVerificationConflits({
  affectations: new AffectationsMongoose(),
});

export const casDUsageOperations = creerCasDUsageOperations({
  operations: new OperationRepositoryMongoose(),
  verifierConflits: checkAssignmentConflicts,
  horloge: new SystemClock(),
});
```

(Aucun test n'espionne `checkAssignmentConflicts` ni l'horloge après coup — vérifié par grep en R4a : la référence directe est sans risque ici.)

- [ ] **Step 5 : Vérification et commit**

Run : `npx tsc --noEmit && npm run lint && npx vitest run` → vert, **1107 tests**.

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!data' ':!package.json'
git status
git commit -m "refactor(operations): cas d'usage CRUD et planning (périmètre, conflits, statut initial, statut effectif)"
```

---

### Task 5 : Contrôleurs, présentation, routes ré-exportées

**Files:**
- Create: `src/backend/operations/http/acteur.ts`, `src/backend/operations/http/presentation.ts`, `src/backend/operations/http/presentation.test.ts`, `src/backend/operations/http/erreurs-http.ts`, `src/backend/operations/http/liste.controleur.ts`, `src/backend/operations/http/detail.controleur.ts`, `src/backend/operations/http/planning.controleur.ts`
- Modify: `src/backend/operations/http/operation.schema.ts` (ajout de `versSaisieOperation`), `src/app/api/operations/route.ts`, `src/app/api/operations/[id]/route.ts`, `src/app/api/operations/planning/route.ts`

**Interfaces:**
- Consomme : `casDUsageOperations` (tâche 4) ; `requireAuth`, `AuthSuccess` (`@/backend/comptes`) ; `guardObjectId` (`@/backend/platform/http/identifiants`).
- Produit : `GET`, `POST` (`liste.controleur`) ; `GET`, `PUT`, `DELETE` (`detail.controleur`) ; `GET` (`planning.controleur`) ; `versActeur(auth)`, `versReponseOperation(operation)`, `versEvenementPlanning(element)`, `versReponseErreur(erreur)`, `versSaisieOperation(entree)`.

- [ ] **Step 1 : Test de la présentation (échec attendu)**

```ts
// src/backend/operations/http/presentation.test.ts
import { describe, it, expect } from "vitest";
import type { Operation } from "../domain/operation";
import { versEvenementPlanning, versReponseOperation } from "./presentation";

const DATE = new Date("2030-11-01T10:00:00.000Z");

const operation = (surcharge: Partial<Operation> = {}): Operation => ({
  id: "op-1",
  clientId: { id: "client-a", nom: "Client A" },
  siteId: { id: "site-a", nom: "Site A", adresse: "Rue 1" },
  natureIntervention: "Collecte",
  dateHeurePrevue: DATE,
  dureeEstimeeMinutes: 120,
  equipementIds: ["equipement-a"],
  informationsParticulieres: "",
  statut: "Planifiée",
  historiqueStatuts: [{ statut: "Planifiée", date: DATE, parUtilisateur: "u-1" }],
  uniteQuantite: "Litres",
  remarquesTerrain: "",
  nomSignataireClient: "",
  signatureClient: "",
  photos: [],
  rapportPdf: "",
  createdAt: DATE,
  updatedAt: DATE,
  revision: 0,
  ...surcharge,
});

describe("versReponseOperation", () => {
  it("restitue la forme JSON historique : `_id`, `__v`, relations peuplées sous `_id`", () => {
    expect(JSON.parse(JSON.stringify(versReponseOperation(operation())))).toEqual({
      _id: "op-1",
      clientId: { _id: "client-a", nom: "Client A" },
      siteId: { _id: "site-a", nom: "Site A", adresse: "Rue 1" },
      natureIntervention: "Collecte",
      dateHeurePrevue: "2030-11-01T10:00:00.000Z",
      dureeEstimeeMinutes: 120,
      equipementIds: ["equipement-a"],
      informationsParticulieres: "",
      statut: "Planifiée",
      historiqueStatuts: [{ statut: "Planifiée", date: "2030-11-01T10:00:00.000Z", parUtilisateur: "u-1" }],
      uniteQuantite: "Litres",
      remarquesTerrain: "",
      nomSignataireClient: "",
      signatureClient: "",
      rapportPdf: "",
      photos: [],
      createdAt: "2030-11-01T10:00:00.000Z",
      updatedAt: "2030-11-01T10:00:00.000Z",
      __v: 0,
    });
  });

  it("relation pendante : null JSON ; relation jamais affectée : clé absente", () => {
    const json = JSON.parse(JSON.stringify(versReponseOperation(operation({ clientId: null, equipeId: null }))));
    expect(json.clientId).toBeNull();
    expect(json.equipeId).toBeNull();
    expect(json).not.toHaveProperty("vehiculeId");
    expect(json).not.toHaveProperty("quantiteCollectee");
  });

  it("niveau détail : équipements et auteur d'historique peuplés, ancien statut conservé", () => {
    const json = JSON.parse(
      JSON.stringify(
        versReponseOperation(
          operation({
            equipementIds: [{ id: "equipement-a", nom: "Pompe", type: "Pompage" }],
            historiqueStatuts: [
              { statut: "Affectée", date: DATE, parUtilisateur: { id: "u-1", nom: "Admin Ops" } },
              { statut: "En route", date: DATE, parUtilisateur: null, ancienStatut: "Affectée" },
              { statut: "En cours", date: DATE },
            ],
            quantiteCollectee: 12,
            photos: [{ url: "data:image/jpeg;base64,BBBB", nom: "cuve.jpg", uploadedAt: DATE }],
          })
        )
      )
    );
    expect(json.equipementIds).toEqual([{ _id: "equipement-a", nom: "Pompe", type: "Pompage" }]);
    expect(json.historiqueStatuts).toEqual([
      { statut: "Affectée", date: "2030-11-01T10:00:00.000Z", parUtilisateur: { _id: "u-1", nom: "Admin Ops" } },
      { statut: "En route", date: "2030-11-01T10:00:00.000Z", parUtilisateur: null, ancienStatut: "Affectée" },
      { statut: "En cours", date: "2030-11-01T10:00:00.000Z" },
    ]);
    expect(json.quantiteCollectee).toBe(12);
    expect(json.photos).toEqual([
      { url: "data:image/jpeg;base64,BBBB", nom: "cuve.jpg", uploadedAt: "2030-11-01T10:00:00.000Z" },
    ]);
  });
});

describe("versEvenementPlanning", () => {
  const FIN = new Date("2030-11-01T12:00:00.000Z");

  it("événement complet", () => {
    const element = {
      operation: operation({
        equipeId: { id: "equipe-a", nom: "Équipe A" },
        vehiculeId: { id: "vehicule-a", identification: "V-001" },
      }),
      statutEffectif: "Retardée" as const,
      fin: FIN,
    };
    expect(JSON.parse(JSON.stringify(versEvenementPlanning(element)))).toEqual({
      id: "op-1",
      title: "Client A — Collecte",
      start: "2030-11-01T10:00:00.000Z",
      end: "2030-11-01T12:00:00.000Z",
      backgroundColor: "#E65100",
      borderColor: "#E65100",
      extendedProps: { statut: "Retardée", site: "Site A", equipe: "Équipe A", vehicule: "V-001" },
    });
  });

  it("client pendant ou non peuplé : « Client » ; relations manquantes : clés absentes", () => {
    for (const clientId of [null, "client-a"]) {
      const json = JSON.parse(
        JSON.stringify(
          versEvenementPlanning({ operation: operation({ clientId, siteId: null }), statutEffectif: "Planifiée", fin: FIN })
        )
      );
      expect(json.title).toBe("Client — Collecte");
      expect(json.extendedProps).toEqual({ statut: "Planifiée" });
    }
  });

  it.each([
    ["Planifiée", "#546E7A"],
    ["Affectée", "#3949AB"],
    ["En route", "#FB8C00"],
    ["En cours", "#1976D2"],
    ["Terminée", "#2E7D32"],
    ["Rapportée", "#1B5E20"],
    ["Retardée", "#E65100"],
    ["Annulée", "#C62828"],
  ] as const)("couleur de %s : %s", (statutEffectif, couleur) => {
    const evenement = versEvenementPlanning({ operation: operation(), statutEffectif, fin: FIN });
    expect(evenement.backgroundColor).toBe(couleur);
    expect(evenement.borderColor).toBe(couleur);
  });

  it("statut inconnu : couleur de repli historique", () => {
    const evenement = versEvenementPlanning({ operation: operation(), statutEffectif: "Bidon" as never, fin: FIN });
    expect(evenement.backgroundColor).toBe("text-status-planned");
  });
});
```

Run : `npx vitest run src/backend/operations/http/presentation.test.ts` → FAIL (module `./presentation` introuvable).

- [ ] **Step 2 : Présentation, acteur, erreurs, saisie**

```ts
// src/backend/operations/http/presentation.ts
import type { OperationStatus } from "@/shared/operations/statuts";
import type { ElementPlanning } from "../application/cas-d-usage";
import type { EntreeHistorique, Operation, Reference } from "../domain/operation";

/** Relation → forme JSON historique : identifiant brut, `null`, ou document peuplé sous `_id`. */
function versReferenceJson(reference: Reference<{ id: string }> | undefined) {
  if (reference == null || typeof reference === "string") return reference;
  const { id, ...champs } = reference;
  return { _id: id, ...champs };
}

function versEntreeJson(entree: EntreeHistorique) {
  return {
    statut: entree.statut,
    date: entree.date,
    parUtilisateur: versReferenceJson(entree.parUtilisateur),
    ancienStatut: entree.ancienStatut,
  };
}

/** Forme JSON historique de l'API (document Mongoose sérialisé) ; les clés `undefined` sont omises par JSON. */
export function versReponseOperation(operation: Operation) {
  return {
    _id: operation.id,
    clientId: versReferenceJson(operation.clientId),
    siteId: versReferenceJson(operation.siteId),
    natureIntervention: operation.natureIntervention,
    dateHeurePrevue: operation.dateHeurePrevue,
    dureeEstimeeMinutes: operation.dureeEstimeeMinutes,
    equipeId: versReferenceJson(operation.equipeId),
    vehiculeId: versReferenceJson(operation.vehiculeId),
    equipementIds: operation.equipementIds.map(versReferenceJson),
    informationsParticulieres: operation.informationsParticulieres,
    statut: operation.statut,
    historiqueStatuts: operation.historiqueStatuts.map(versEntreeJson),
    quantiteCollectee: operation.quantiteCollectee,
    uniteQuantite: operation.uniteQuantite,
    remarquesTerrain: operation.remarquesTerrain,
    nomSignataireClient: operation.nomSignataireClient,
    signatureClient: operation.signatureClient,
    rapportPdf: operation.rapportPdf,
    photos: operation.photos,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    __v: operation.revision,
  };
}

const COULEURS: Record<OperationStatus, string> = {
  Planifiée: "#546E7A",
  Affectée: "#3949AB",
  "En route": "#FB8C00",
  "En cours": "#1976D2",
  Terminée: "#2E7D32",
  Rapportée: "#1B5E20",
  Retardée: "#E65100",
  Annulée: "#C62828",
};

// Repli historique pour un statut inconnu (ancienne valeur de `STATUS_CONFIG.Planifiée.color`).
const COULEUR_DE_REPLI = "text-status-planned";

/** Champ d'une relation peuplée ; `undefined` si la relation est absente, pendante ou non peuplée. */
function champ<T extends { id: string }, K extends keyof T>(reference: Reference<T> | undefined, cle: K): T[K] | undefined {
  return reference != null && typeof reference !== "string" ? reference[cle] : undefined;
}

/** Événement au format FullCalendar. */
export function versEvenementPlanning({ operation, statutEffectif, fin }: ElementPlanning) {
  const couleur = COULEURS[statutEffectif] ?? COULEUR_DE_REPLI;
  return {
    id: operation.id,
    title: `${champ(operation.clientId, "nom") ?? "Client"} — ${operation.natureIntervention}`,
    start: operation.dateHeurePrevue,
    end: fin,
    backgroundColor: couleur,
    borderColor: couleur,
    extendedProps: {
      statut: statutEffectif,
      site: champ(operation.siteId, "nom"),
      equipe: champ(operation.equipeId, "nom"),
      vehicule: champ(operation.vehiculeId, "identification"),
    },
  };
}
```

```ts
// src/backend/operations/http/acteur.ts
import type { AuthSuccess } from "@/backend/comptes";
import type { Acteur } from "@/shared/acces/acteur";

/** Identité de la session, telle que la reçoivent les cas d'usage. */
export function versActeur(auth: AuthSuccess): Acteur {
  return { id: auth.user.id, role: auth.role, clientId: auth.clientId, equipeId: auth.equipeId };
}
```

```ts
// src/backend/operations/http/erreurs-http.ts
import { NextResponse } from "next/server";
import { ChauffeurSansEquipe, ConflitAffectation, OperationIntrouvable } from "../domain/erreurs";

/** Traduit une erreur métier en réponse HTTP ; toute autre erreur remonte telle quelle. */
export function versReponseErreur(erreur: unknown): NextResponse {
  if (erreur instanceof ChauffeurSansEquipe) {
    return NextResponse.json({ error: erreur.message }, { status: 403 });
  }
  if (erreur instanceof OperationIntrouvable) {
    return NextResponse.json({ error: erreur.message }, { status: 404 });
  }
  if (erreur instanceof ConflitAffectation) {
    return NextResponse.json({ error: erreur.message, conflicts: erreur.conflits }, { status: 409 });
  }
  throw erreur;
}
```

Ajouter à la fin de `src/backend/operations/http/operation.schema.ts` (et l'import de type en tête) :

```ts
import type { OperationSaisie } from "../domain/operation";
```

```ts
/**
 * Sortie Zod → saisie du domaine. La recopie par décomposition conserve l'absence des clés
 * facultatives non fournies (`equipeId`, `vehiculeId`, `statut`, `quantiteCollectee`) : à la
 * modification, une clé absente laisse la valeur stockée intacte. Aucune validation de la date :
 * une chaîne illisible donne une date invalide, rejetée par Mongoose (comportement historique).
 */
export function versSaisieOperation(entree: OperationInput): OperationSaisie {
  return { ...entree, dateHeurePrevue: new Date(entree.dateHeurePrevue) } as OperationSaisie;
}
```

Run : `npx vitest run src/backend/operations/http/presentation.test.ts` → PASS (**14 tests**).

- [ ] **Step 3 : Contrôleurs**

```ts
// src/backend/operations/http/liste.controleur.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/backend/comptes";
import { casDUsageOperations } from "../composition";
import type { FiltreOperations } from "../domain/operation";
import { versActeur } from "./acteur";
import { versReponseErreur } from "./erreurs-http";
import { operationSchema, versSaisieOperation } from "./operation.schema";
import { versReponseOperation } from "./presentation";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const sp = req.nextUrl.searchParams;
  const filtre: FiltreOperations = {};

  const clientId = sp.get("clientId");
  const siteId = sp.get("siteId");
  const equipeId = sp.get("equipeId");
  const vehiculeId = sp.get("vehiculeId");
  const statut = sp.get("statut");
  if (clientId) filtre.clientId = clientId;
  if (siteId) filtre.siteId = siteId;
  if (equipeId) filtre.equipeId = equipeId;
  if (vehiculeId) filtre.vehiculeId = vehiculeId;
  if (statut) filtre.statut = statut;

  const dateDebut = sp.get("dateDebut");
  const dateFin = sp.get("dateFin");
  if (dateDebut) filtre.dateDebut = new Date(dateDebut);
  if (dateFin) filtre.dateFin = new Date(dateFin);

  // Calcul historique, volontairement sans garde-fou (valeurs hors norme renvoyées telles quelles).
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const limit = Math.min(100, parseInt(sp.get("limit") || "20", 10));
  const skip = (page - 1) * limit;

  try {
    const { items, total } = await casDUsageOperations.lister(versActeur(auth), filtre, { skip, limit });
    return NextResponse.json({ items: items.map(versReponseOperation), total, page, limit });
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const body = await req.json();
  const parsed = operationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const operation = await casDUsageOperations.creer(versActeur(auth), versSaisieOperation(parsed.data));
    return NextResponse.json(versReponseOperation(operation), { status: 201 });
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}
```

```ts
// src/backend/operations/http/detail.controleur.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/backend/comptes";
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { casDUsageOperations } from "../composition";
import { versActeur } from "./acteur";
import { versReponseErreur } from "./erreurs-http";
import { operationSchema, versSaisieOperation } from "./operation.schema";
import { versReponseOperation } from "./presentation";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const acteur = versActeur(auth);

  // Ordre historique : le refus « chauffeur sans équipe » (403) précède le contrôle de l'identifiant (400).
  try {
    casDUsageOperations.verifierAccesLecture(acteur);
  } catch (erreur) {
    return versReponseErreur(erreur);
  }

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  try {
    return NextResponse.json(versReponseOperation(await casDUsageOperations.obtenir(acteur, id)));
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  const body = await req.json();
  const parsed = operationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const operation = await casDUsageOperations.modifier(id, versSaisieOperation(parsed.data));
    return NextResponse.json(versReponseOperation(operation));
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  try {
    await casDUsageOperations.supprimer(id);
    return NextResponse.json({ success: true });
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}
```

```ts
// src/backend/operations/http/planning.controleur.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/backend/comptes";
import { casDUsageOperations } from "../composition";
import type { FiltreOperations } from "../domain/operation";
import { versActeur } from "./acteur";
import { versReponseErreur } from "./erreurs-http";
import { versEvenementPlanning } from "./presentation";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const sp = req.nextUrl.searchParams;
  const dateDebut = sp.get("dateDebut");
  const dateFin = sp.get("dateFin");

  // Seules les bornes de date sont lues ici : le planning n'a jamais filtré par client, équipe ou statut.
  const filtre: FiltreOperations = {};
  if (dateDebut) filtre.dateDebut = new Date(dateDebut);
  if (dateFin) filtre.dateFin = new Date(dateFin);

  try {
    const elements = await casDUsageOperations.planning(versActeur(auth), filtre);
    return NextResponse.json(elements.map(versEvenementPlanning));
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}
```

- [ ] **Step 4 : Réduire les trois routes à des ré-exports**

`src/app/api/operations/route.ts` (contenu intégral) :

```ts
export { GET, POST } from "@/backend/operations/http/liste.controleur";
```

`src/app/api/operations/[id]/route.ts` (contenu intégral) :

```ts
export { GET, PUT, DELETE } from "@/backend/operations/http/detail.controleur";
```

`src/app/api/operations/planning/route.ts` (contenu intégral) :

```ts
export { GET } from "@/backend/operations/http/planning.controleur";
```

Les trois autres routes (`[id]/statut`, `[id]/photos`, `[id]/rapport`) ne sont **pas** touchées.

- [ ] **Step 5 : Le filet et les tests existants sont l'oracle**

Run : `npx vitest run tests/integration/operations-crud-caracterisation.test.ts tests/integration/operations-conflits-caracterisation.test.ts tests/integration/operations-api.test.ts tests/integration/chauffeur-scope.test.ts tests/integration/authz-roles.test.ts tests/integration/dashboard-planning.test.ts tests/integration/status-workflow.test.ts tests/integration/recurrences-api.test.ts`

Expected : tout PASS, **sans avoir modifié aucun de ces fichiers dans cette tâche**. Un échec désigne un écart de comportement du nouveau code : le corriger dans `http/`, `application/` ou le dépôt — jamais dans le test. Écart accepté déjà connu et non testé par le filet : la liste d'un document écrit hors Mongoose porte désormais les valeurs par défaut du schéma.

- [ ] **Step 6 : Prouver que les règles d'architecture mordent**

Ajouter temporairement en tête de `src/backend/operations/http/liste.controleur.ts` : `import "../infrastructure/mongoose/operation.model";`

Run : `npx vitest run tests/architecture` → FAIL avec `R3 src/backend/operations/http/liste.controleur.ts importe « ../infrastructure/mongoose/operation.model »`.

Annuler (`git checkout` n'est pas possible sur un fichier non suivi : retirer la ligne à la main) ; relancer → PASS.

- [ ] **Step 7 : Vérification complète et commit**

```bash
npx tsc --noEmit && npm run lint && npx vitest run
MONGODB_URI="mongodb://127.0.0.1:9/inexistant" NEXTAUTH_SECRET="verification-build" \
NEXTAUTH_URL="http://localhost:3000" NEXT_TELEMETRY_DISABLED=1 npx next build
```

Expected : vert, **1121 tests** ; compilation Next réussie (les ré-exports de gestionnaires sont acceptés).

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!data' ':!package.json'
git status
git commit -m "refactor(operations): contrôleurs liste, détail et planning ; trois routes réduites à des ré-exports"
```

---

### Task 6 : Documentation, statuts et revue du sous-jalon

**Files:** `README.md`, `docs/superpowers/plans/2026-09-20-refactor-architecture-master.md`, `docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md`

- [ ] **Step 1 : README** (paragraphe « État de la migration »). Remplacer la phrase sur `operations` écrite en R4a par : « Le domaine `operations` est **en cours** : R4a (règles pures : statut effectif, conflits, visibilité ; transitions dans `src/shared/operations/transitions.ts`) et R4b (modèle, schémas Zod, entité, dépôt, cas d'usage et contrôleurs de la liste, de la création, du détail, de la modification, de la suppression et du planning) sont réalisés ; les routes `statut`, `photos` (R4c) et `rapport` (R4d) restent héritées dans `src/app/api/operations/[id]/`. » Dans « Notes de migration », ajouter l'écart accepté sur les opérations écrites hors Mongoose (valeurs par défaut du schéma présentées). Vérifier chaque chemin cité (`ls`).

- [ ] **Step 2 : Statuts.** Plan maître : ligne R4 → **« En cours (4a, 4b réalisés ; 4c, 4d à venir) »** ; retirer du « Suivi tracé, à traiter en 4b/4c » de R4a les deux points soldés ici (déplacement du modèle ; branchement de la visibilité pour la lecture — le branchement de `peutAgirSurOperation` reste pour 4c). Spec : ligne de statut → « R4 en cours (4a, 4b réalisés) ». Ajouter une section « Enseignements de R4b » avec, au minimum : (1) une sonde exécutée contre les routes actuelles **avant** d'écrire le plan a révélé des comportements que la lecture seule ne montrait pas (pagination hors norme, exceptions Mongoose non interceptées, `PUT` qui réinitialise les champs à défaut Zod) ; (2) les trois niveaux de peuplement et la règle « le dépôt recopie les champs sélectionnés, la présentation les restitue » ; (3) l'ordre 403 → 400 du détail, préservé par `verifierAccesLecture` appelé par le contrôleur avant le contrôle de l'identifiant (leçon R3b sur l'ordre des vérifications) ; (4) tout ce que l'exécution a réellement appris et que ce plan n'avait pas prévu.

- [ ] **Step 3 : Non-régression ciblée** (à consigner dans le rapport) : `git diff main --stat -- tests/unit tests/integration` → un fichier créé (tâche 1) et des lignes d'import seulement ailleurs ; `grep -rn "models/Operation\|validators/operation" src tests scripts` → rien ; `ls src/models src/lib/validators` → ni `Operation.ts` ni `operation.ts` ; `wc -l src/app/api/operations/route.ts "src/app/api/operations/[id]/route.ts" src/app/api/operations/planning/route.ts` → 1 ligne chacun.

- [ ] **Step 4 : Commit**

```bash
git add README.md docs/superpowers
git commit -m "docs: statuts du sous-jalon R4b (operations : CRUD et planning)"
```

- [ ] **Step 5 : Revue du sous-jalon** — **effectuée par le contrôleur** (revue finale de branche complète, modèle le plus capable ; ne pas la dispatcher comme tâche). Critères : chaque gestionnaire migré comparé ligne à ligne à sa version de `main` (`git show main:src/app/api/operations/route.ts`, etc.) — mêmes gardes, même ordre, mêmes champs peuplés, même tri, mêmes messages ; aucun `connectDB()` perdu ; aucune clé `undefined` introduite dans une saisie de modification ; `domain/` et `application/` sans `mongoose`, `next` ni `platform` ; les trois routes non migrées n'ont changé que par leurs imports ; `package.json` absent de tous les commits.

---

## Auto-relecture

- **Couverture de la spec (R4b = « cas d'usage CRUD + planning ») :** lister avec filtres et périmètre (tâches 3-5) ; créer avec conflit et statut initial (tâches 4-5) ; modifier, supprimer (tâches 4-5) ; planning avec statut effectif et `Horloge` (tâches 4-5) ; `OperationRepository` et adaptateur Mongoose (tâche 3) ; modèle déplacé sans modification de schéma (tâche 2) ; visibilité appliquée par les cas d'usage sur `Acteur` (tâche 4). **Restent pour 4c-4d, volontairement :** changement de statut (transitions, historique, champs terrain, règle « Terminée sans En cours »), photos (plafonds 2 Mo / 8 Mo / 10), rapport PDF (`GenerateurRapportPdf`), retrait des gardes héritées `isWithinClientScope`/`isWithinTeamScope` quand plus aucune route d'`operations` ne les utilisera.
- **Cohérence des noms :** `Operation`, `OperationSaisie`, `StatutInitial`, `FiltreOperations`, `Pagination`, `Reference`, `idDeReference` (tâche 3, repris tels quels en 4 et 5) ; `OperationRepository.{lister,listerPourPlanning,trouverDetailParId,creer,modifier,supprimer}` (port, adaptateur, faux, cas d'usage) ; `VerificationConflits`, `Horloge` (port, cas d'usage, composition) ; `OperationIntrouvable`, `ChauffeurSansEquipe`, `ConflitAffectation.conflits` (domaine, cas d'usage, `versReponseErreur`) ; `creerCasDUsageOperations` / `casDUsageOperations.{verifierAccesLecture,lister,obtenir,creer,modifier,supprimer,planning}` (tâche 4, contrôleurs) ; `ElementPlanning { operation, statutEffectif, fin }` (cas d'usage, présentation) ; `versActeur`, `versReponseOperation`, `versEvenementPlanning`, `versReponseErreur`, `versSaisieOperation` (tâche 5).
- **Décomptes de tests attendus :** 1028 → 1057 (tâche 1, +29) → 1057 (tâche 2) → 1075 (tâche 3, +18) → 1107 (tâche 4, +32) → 1121 (tâche 5, +14). Un écart de quelques unités vient d'un `it.each` mal compté par ce plan : à noter dans le rapport, pas à « corriger » en retirant des tests.
- **Points de vigilance :** (1) `versSaisieOperation` recopie par décomposition : ne **pas** la réécrire champ par champ, cela introduirait des clés `undefined` dont le sort dans un `findByIdAndUpdate` n'est pas établi ; (2) `versReference` teste `instanceof mongoose.Types.ObjectId` **avant** de regarder `_id` : Mongoose expose un accesseur `_id` sur les ObjectId eux-mêmes ; (3) le planning n'est **pas** trié et ne lit que `dateDebut`/`dateFin` ; (4) dans le détail, `verifierAccesLecture` est appelé par le contrôleur **avant** `guardObjectId` — et de nouveau par `obtenir`, par défense ; (5) `PUT` : aucun contrôle de périmètre ni d'acteur (seul `requireAuth(true)`), comme aujourd'hui ; (6) les exceptions Mongoose (`CastError`, `ValidationError`) doivent continuer à remonter : `versReponseErreur` relance tout ce qu'il ne connaît pas ; (7) la couleur de repli `"text-status-planned"` est une chaîne recopiée, pas un import de `@/lib/status-styles` (ce module partira dans le frontend à R8) ; (8) `package.json` et `skills-lock.json` ne sont jamais indexés.
