# Refactoring R4c — Domaine `operations` : statut, données de terrain, photos : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire passer le changement de statut (transitions, historique, données de terrain) et l'ajout/retrait de photos par l'architecture hexagonale : règles pures (plafonds de photos, alerte de cohérence), erreurs métier, trois méthodes de dépôt, cas d'usage « terrain », deux contrôleurs ; `[id]/statut/route.ts` et `[id]/photos/route.ts` deviennent des ré-exports. Rétablir au passage la défense en profondeur sur le périmètre de lecture signalée par la revue finale de R4b. Troisième des quatre sous-plans de R4. **Hors périmètre :** `GET …/rapport` (4d) reste une route héritée et continue d'utiliser les gardes de `comptes/http/acteur.ts`, qui ne sont donc **pas** retirées ici.

**Architecture:** `src/backend/operations/` reçoit `domain/{photos,changement-statut}.ts`, des erreurs et des ports supplémentaires, `application/cas-d-usage-terrain.ts`, trois méthodes de plus sur `OperationRepositoryMongoose` (lecture de l'état terrain, changement de statut, photos) et `http/{statut,photos}.controleur.ts`. Les écritures gardent la mécanique d'origine — charger le document, le modifier, `save()` — parce que la révision `__v` renvoyée dans les réponses en dépend. `peutAgirSurOperation` (R4a) est branchée ici pour la première fois.

**Tech Stack:** Next.js 16 (`src/`), TypeScript, Mongoose 8, Zod, Vitest + mongodb-memory-server, ESLint 9.

**Spec / feuille de route:** `docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md` (§6 ligne `operations` : « transitions de statut ; […] plafonds de photos (2 Mo / 8 Mo / 10) ; visibilité par rôle et équipe | […] changer le statut (historique, champs terrain), ajouter/retirer une photo ») ; `docs/superpowers/plans/2026-09-20-refactor-architecture-master.md` (contraintes, recette, enseignements R0-R4b, « Suivi tracé, à traiter en 4c ») ; `docs/superpowers/plans/2026-10-03-refactor-r4b-operations-crud-planning.md` (ce qui existe déjà : entité, dépôt, présentation, `versReponseErreur`).

## Global Constraints

- **Aucun changement de comportement** : mêmes codes HTTP, mêmes corps JSON (dont `__v`), mêmes messages au mot près (table des faits), **même ordre des vérifications**, mêmes exceptions non interceptées (corps JSON illisible, corps `null`).
- **Un seul changement délibéré, sur un chemin aujourd'hui inatteignable** (tâche 4) : un compte `client` sans `clientId` qui atteindrait un cas d'usage de lecture est refusé (403 « Compte client sans périmètre attribué », le message de `requireAuth`) au lieu de voir le filtre de périmètre disparaître. `requireAuth` refuse déjà ce compte en amont : aucune réponse observable ne change.
- **Écarts connus et acceptés** (plan maître, README) : ordre des clés JSON ; valeurs par défaut du schéma présentées pour un champ absent ou `null` en base.
- Les tests existants ne changent que par leurs **chemins d'import**. Aucune assertion supprimée, affaiblie ou passée en `skip`.
- À chaque commit : `npx tsc --noEmit` propre, `npm run lint` (0 erreur), `npx vitest run` tout vert (**1121 tests / 82 fichiers au départ**, mesuré sur `main` `a4df918`).
- Règles de dépendance : `domain/` n'importe que `@/shared/**` et lui-même ; `application/` n'importe que `domain/` et `shared/` ; `http/` n'atteint `infrastructure/` que par `composition.ts`.
- Préserver chaque `await connectDB()` : le dépôt l'appelle avant **chaque** requête.
- Ne jamais lire ni afficher `.env.local` ; ne jamais lancer `npm run build`, `npm run seed`, `scripts/seed-admin.ts` ni `scripts/send-test-mail.ts`. Compilation Next : uniquement `verifier-build` (plan maître).
- Ne jamais stager `.agents/`, `.claude/`, `skills-lock.json`, `rapports/`, `package.json`. Commande d'ajout : `git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!package.json'` puis `git status` (le pathspec `':!data'` est retiré : `data/` est ignoré par `.gitignore` et faisait échouer la commande — leçon R4b).
- Branche : `refactor/r4c-operations-terrain`, **déjà créée** depuis `main` (`a4df918`) pendant la rédaction de ce plan. Fusion locale après revue ; aucun push sans accord.

### Faits vérifiés sur le code actuel (base du plan)

Établis par lecture et par exécution : tous sont épinglés par `tests/integration/operations-terrain-caracterisation.test.ts` (17 tests, **déjà écrit et vert sur `main`** — tâche 1).

| Route | Ordre exact des vérifications | Comportement | Codes |
|---|---|---|---|
| `PATCH /api/operations/[id]/statut` | `requireTerrainWrite()` (401 ; 403 « Permission insuffisante » pour `lecture` et `client`) → chauffeur sans équipe (403) → identifiant (400) → `req.json()` → Zod `statusUpdateSchema` (400 `{ error: flatten() }`) → lecture → introuvable (404) → équipe (403 « Opération non affectée à votre équipe ») → transition (400 `Transition <ancien> → <nouveau> non autorisée`) → écriture | `statut` appliqué (le même statut est accepté) ; `quantiteCollectee`, `remarquesTerrain`, `nomSignataireClient`, `signatureClient`, `photos` appliqués **si fournis** (`!== undefined` : une chaîne vide ou un tableau vide sont appliqués) ; `uniteQuantite` appliquée si **véridique** ; `photos` fourni **remplace toutes** les photos (`nom` absent → `""`, `uploadedAt` → défaut du schéma, **sans** contrôle de poids ni de nombre) ; une entrée d'historique `{ statut, date: maintenant, parUtilisateur: id de session, ancienStatut }` est ajoutée ; si le nouveau statut est `Terminée` et que l'ancien n'est pas `En cours` (y compris `Terminée` → `Terminée`), `console.warn("[cohérence] Opération <id> passée Terminée sans En cours (était <ancien>)")` ; relecture peuplée niveau « terrain » | 200, 400, 401, 403, 404 |
| `POST /api/operations/[id]/photos` | `requireTerrainWrite()` → chauffeur sans équipe (403) → identifiant (400) → `req.json()` → photo absente ou non chaîne (400 « Photo requise (base64 data URL) ») → ne commence pas par `data:image/` (400 « Format de photo invalide ») → plus de 2 Mo (413 « La photo dépasse 2 Mo. Réduisez sa taille avant l'envoi. ») → lecture → introuvable (404) → équipe (403) → déjà 10 photos (400 « Maximum de 10 photos atteint ») → cumul > 8 Mo (413 « Les photos de cette opération dépassent 8 Mo au total. ») → écriture | Photo `{ url, nom: body.nom \|\| "photo-<horodatage ms>.jpg", uploadedAt: maintenant }` ajoutée **à la suite** ; réponse `{ photo }` | 201, 400, 401, 403, 404, 413 |
| `DELETE /api/operations/[id]/photos` | `requireTerrainWrite()` → chauffeur sans équipe (403) → identifiant (400) → `req.json()` → `url` absente (400 « URL de la photo requise ») → lecture → introuvable (404) → équipe (403) → écriture | Retire **toutes** les photos portant cette URL ; URL inconnue : succès sans effet ; `{ success: true }` | 200, 400, 401, 403, 404 |

**Niveau de peuplement « terrain »** (réponse du `PATCH`) : `clientId` → `nom` ; `siteId` → `nom adresse` ; `equipeId` → `nom` ; `vehiculeId` → `identification` ; `equipementIds` → `nom` ; auteur d'historique non peuplé.

**Poids d'une photo** : `Buffer.byteLength(dataUrl, "utf8")`, comparaisons **strictes** (2 Mo et 8 Mo exactement sont acceptés) ; une photo existante sans `url` compte pour 0.

**Révision `__v`** (constaté par le filet) : chaque `save()` qui modifie un tableau incrémente `__v` de 1 — le `PATCH` (historique), l'ajout d'une photo, le retrait d'une photo existante. Le retrait d'une URL inconnue n'écrit rien : `__v` inchangé. Conséquence : le dépôt doit reproduire « charger le document, le modifier, `save()` » et non un `updateOne`.

**Importeurs / routes à transformer** : `src/app/api/operations/[id]/statut/route.ts` (92 lignes) et `src/app/api/operations/[id]/photos/route.ts` (111 lignes). `src/app/api/operations/[id]/rapport/route.ts` n'est pas touché.

**Couverture existante** : `tests/integration/status-workflow.test.ts` (2), `tests/integration/phase2-import-photos.test.ts` (signature, ajout/retrait, formats, plafonds 2 Mo et 8 Mo), `tests/integration/{authz-roles,chauffeur-scope}.test.ts` (rôles, équipes).

**Constat de la revue finale de R4b à traiter ici** : `perimetreDeLecture` (R4a) peut renvoyer `{ clientId: undefined }` pour un compte client sans `clientId`, et `versFiltreMongo` (R4b) ignore les valeurs fausses : le filtre de périmètre disparaîtrait. Inatteignable (`requireAuth` refuse ce compte), mais la défense en profondeur est perdue → tâche 4.

## Review Focus

1. **Chauffeur d'une autre équipe, ou opération sans équipe** : aucune écriture (statut, photo ajoutée ou retirée), 403 avec le message exact, et le contrôle d'équipe précède celui de la transition et des plafonds — tâche 4 (cas d'usage) et filet.
2. **Transition interdite accompagnée de données de terrain** : rien n'est écrit, pas même les remarques — tâche 4 (cas d'usage) et filet.
3. **Plafonds de photos aux bornes exactes** (2 Mo pile acceptés, 8 Mo cumulés pile acceptés, 10ᵉ photo acceptée, 11ᵉ refusée, nombre contrôlé avant le poids) — tâche 2 (`photos.test.ts`).
4. **Champ de terrain omis lors d'un changement de statut** : la valeur stockée est conservée ; chaîne vide ou tableau vide fournis : appliqués — tâche 3 (contrat du dépôt) et filet.
5. **Révision `__v`** après un changement de statut, un ajout et un retrait de photo : incrémentée comme aujourd'hui ; retrait d'une URL inconnue : inchangée — tâche 3 (contrat du dépôt) et filet.

## File Structure

| Fichier | Responsabilité |
|---|---|
| `tests/integration/operations-terrain-caracterisation.test.ts` (déjà écrit) | Filet : formes exactes de `PATCH statut`, `POST/DELETE photos` |
| `src/backend/operations/domain/photos.ts` (+ test) (créer) | Plafonds, poids stocké, validation d'une nouvelle photo, capacité restante |
| `src/backend/operations/domain/changement-statut.ts` (+ test) (créer) | Types du changement de statut, alerte de cohérence |
| `src/backend/operations/domain/erreurs.ts` (compléter) | Huit erreurs métier supplémentaires |
| `src/backend/operations/domain/visibilite.ts` (+ test) (compléter) | `compteClientSansPerimetre` |
| `src/backend/operations/domain/ports.ts` (compléter) | Trois méthodes de dépôt, `AlerteCoherence` |
| `src/backend/operations/infrastructure/mongoose/operation.repository.mongoose.ts` (+ test de contrat) (compléter) | État terrain, changement de statut, photos |
| `src/backend/operations/infrastructure/en-memoire/operation.repository.en-memoire.ts` (compléter) | Mêmes méthodes dans le faux |
| `src/backend/operations/application/cas-d-usage-terrain.ts` (+ test) (créer) | `creerCasDUsageTerrain` |
| `src/backend/operations/application/cas-d-usage.ts` (+ test) (modifier) | Refus d'un compte client sans périmètre |
| `src/backend/operations/http/{statut,photos}.controleur.ts` (créer) | Contrôleurs |
| `src/backend/operations/http/erreurs-http.ts` (+ test) (compléter) | Traduction des nouvelles erreurs |
| `src/backend/operations/http/operation.schema.ts` (compléter) | `versDemandeStatut` |
| `src/app/api/operations/[id]/{statut,photos}/route.ts` (réduire) | Ré-exports |

---

### Task 1 : Filet — formes exactes du statut et des photos

**Files:**
- Test (déjà présent, non suivi par Git) : `tests/integration/operations-terrain-caracterisation.test.ts`

**Interfaces:**
- Produit : un oracle de 17 tests qui doit rester vert, **sans modification**, à travers les tâches 2 à 5.

- [ ] **Step 1 : Vérifier la branche et la présence du filet**

```bash
git branch --show-current   # attendu : refactor/r4c-operations-terrain
git status --short          # attendu : ?? tests/integration/operations-terrain-caracterisation.test.ts (et ce plan s'il n'est pas commité)
```

Si le fichier de test est absent, **s'arrêter** : il a été écrit et validé avec ce plan et ne doit pas être réinventé.

- [ ] **Step 2 : Vérifier qu'il passe sur le code actuel**

Run : `npx vitest run tests/integration/operations-terrain-caracterisation.test.ts`
Expected : 17 tests PASS. Si l'un échoue, **le test est faux, pas le code** : le corriger pour décrire le comportement réel, ne jamais toucher aux routes dans cette tâche.

- [ ] **Step 3 : Vérification et commit**

Run : `npx tsc --noEmit && npm run lint && npx vitest run` → vert, **1138 tests**.

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!package.json'
git status
git commit -m "test(operations): caractérisation des formes exactes du statut et des photos"
```

---

### Task 2 : Règles pures — photos, alerte de cohérence, erreurs

**Files:**
- Create: `src/backend/operations/domain/photos.ts`, `src/backend/operations/domain/photos.test.ts`, `src/backend/operations/domain/changement-statut.ts`, `src/backend/operations/domain/changement-statut.test.ts`
- Modify: `src/backend/operations/domain/erreurs.ts`

**Interfaces:**
- Produit :
  ```ts
  // domain/erreurs.ts (ajouts ; message entre guillemets)
  export class CompteClientSansPerimetre extends Error {}  // « Compte client sans périmètre attribué »
  export class OperationHorsEquipe extends Error {}        // MESSAGE_HORS_EQUIPE
  export class TransitionInterdite extends Error { constructor(de: OperationStatus, vers: OperationStatus) }  // « Transition <de> → <vers> non autorisée »
  export class PhotoRequise extends Error {}               // « Photo requise (base64 data URL) »
  export class FormatPhotoInvalide extends Error {}        // « Format de photo invalide »
  export class PhotoTropLourde extends Error {}            // « La photo dépasse 2 Mo. Réduisez sa taille avant l'envoi. »
  export class TropDePhotos extends Error {}               // « Maximum de 10 photos atteint »
  export class PhotosTropLourdes extends Error {}          // « Les photos de cette opération dépassent 8 Mo au total. »
  export class UrlPhotoRequise extends Error {}            // « URL de la photo requise »
  // domain/photos.ts
  export const MAX_PHOTO_OCTETS: number;            // 2 Mo
  export const MAX_PHOTOS_OCTETS_CUMULES: number;   // 8 Mo
  export const MAX_PHOTOS: number;                  // 10
  export function octetsStockes(dataUrl: string): number;
  export function validerNouvellePhoto(photo: unknown): string;                                   // renvoie l'URL de données validée
  export function verifierCapacite(existantes: { url?: string }[], nouvelle: string): void;
  // domain/changement-statut.ts
  export interface DonneesTerrain { quantiteCollectee?: number; uniteQuantite?: QuantiteUnite; remarquesTerrain?: string; nomSignataireClient?: string; signatureClient?: string; photos?: { url: string; nom?: string }[] }
  export interface DemandeChangementStatut extends DonneesTerrain { statut: OperationStatus }
  export interface ChangementStatut extends DemandeChangementStatut { ancienStatut: OperationStatus; date: Date; parUtilisateur: string }
  export interface EtatTerrain { statut: OperationStatus; equipeId?: string | null; photos: { url?: string }[] }
  export function terminaisonSansEnCours(ancien: OperationStatus, nouveau: OperationStatus): boolean;
  export function messageAlerteCoherence(operationId: string, ancien: OperationStatus): string;
  ```

- [ ] **Step 1 : Compléter les erreurs**

Dans `src/backend/operations/domain/erreurs.ts`, remplacer les deux lignes d'import par :

```ts
import type { OperationStatus } from "@/shared/operations/statuts";
import type { ConflictResult } from "./conflits";
import { MESSAGE_CHAUFFEUR_SANS_EQUIPE, MESSAGE_HORS_EQUIPE } from "./visibilite";
```

et ajouter à la fin du fichier :

```ts
/** Défense en profondeur : `requireAuth` refuse déjà ce compte avec le même message. */
export class CompteClientSansPerimetre extends Error {
  constructor() {
    super("Compte client sans périmètre attribué");
    this.name = "CompteClientSansPerimetre";
  }
}

export class OperationHorsEquipe extends Error {
  constructor() {
    super(MESSAGE_HORS_EQUIPE);
    this.name = "OperationHorsEquipe";
  }
}

export class TransitionInterdite extends Error {
  constructor(de: OperationStatus, vers: OperationStatus) {
    super(`Transition ${de} → ${vers} non autorisée`);
    this.name = "TransitionInterdite";
  }
}

export class PhotoRequise extends Error {
  constructor() {
    super("Photo requise (base64 data URL)");
    this.name = "PhotoRequise";
  }
}

export class FormatPhotoInvalide extends Error {
  constructor() {
    super("Format de photo invalide");
    this.name = "FormatPhotoInvalide";
  }
}

export class PhotoTropLourde extends Error {
  constructor() {
    super("La photo dépasse 2 Mo. Réduisez sa taille avant l'envoi.");
    this.name = "PhotoTropLourde";
  }
}

export class TropDePhotos extends Error {
  constructor() {
    super("Maximum de 10 photos atteint");
    this.name = "TropDePhotos";
  }
}

export class PhotosTropLourdes extends Error {
  constructor() {
    super("Les photos de cette opération dépassent 8 Mo au total.");
    this.name = "PhotosTropLourdes";
  }
}

export class UrlPhotoRequise extends Error {
  constructor() {
    super("URL de la photo requise");
    this.name = "UrlPhotoRequise";
  }
}
```

- [ ] **Step 2 : Tests des règles pures (échec attendu)**

```ts
// src/backend/operations/domain/photos.test.ts
import { describe, it, expect } from "vitest";
import {
  FormatPhotoInvalide,
  PhotoRequise,
  PhotoTropLourde,
  PhotosTropLourdes,
  TropDePhotos,
} from "./erreurs";
import {
  MAX_PHOTO_OCTETS,
  MAX_PHOTOS,
  MAX_PHOTOS_OCTETS_CUMULES,
  octetsStockes,
  validerNouvellePhoto,
  verifierCapacite,
} from "./photos";

const PREFIXE = "data:image/jpeg;base64,";
const photoDe = (octets: number) => PREFIXE.padEnd(octets, "A");

describe("octetsStockes", () => {
  it("compte les octets de la chaîne stockée", () => {
    expect(octetsStockes("")).toBe(0);
    expect(octetsStockes(photoDe(1000))).toBe(1000);
  });

  it("compte en UTF-8 : un caractère accentué pèse deux octets", () => {
    expect(octetsStockes("é")).toBe(2);
  });
});

describe("validerNouvellePhoto", () => {
  it.each([undefined, null, "", 42, { url: "x" }])("valeur %j : PhotoRequise", (valeur) => {
    expect(() => validerNouvellePhoto(valeur)).toThrow(PhotoRequise);
  });

  it.each(["https://exemple.ci/photo.jpg", "data:text/plain;base64,AAAA"])("« %s » : FormatPhotoInvalide", (valeur) => {
    expect(() => validerNouvellePhoto(valeur)).toThrow(FormatPhotoInvalide);
  });

  it("2 Mo exactement : acceptée, l'URL est renvoyée telle quelle", () => {
    const photo = photoDe(MAX_PHOTO_OCTETS);
    expect(validerNouvellePhoto(photo)).toBe(photo);
  });

  it("un octet de plus que 2 Mo : PhotoTropLourde", () => {
    expect(() => validerNouvellePhoto(photoDe(MAX_PHOTO_OCTETS + 1))).toThrow(PhotoTropLourde);
  });

  it("messages exacts", () => {
    expect(() => validerNouvellePhoto(undefined)).toThrow("Photo requise (base64 data URL)");
    expect(() => validerNouvellePhoto("x")).toThrow("Format de photo invalide");
    expect(() => validerNouvellePhoto(photoDe(MAX_PHOTO_OCTETS + 1))).toThrow(
      "La photo dépasse 2 Mo. Réduisez sa taille avant l'envoi."
    );
  });
});

describe("verifierCapacite", () => {
  const existantes = (nombre: number, octets = 100) => Array.from({ length: nombre }, () => ({ url: photoDe(octets) }));

  it("neuf photos existantes : la dixième est acceptée", () => {
    expect(() => verifierCapacite(existantes(MAX_PHOTOS - 1), photoDe(100))).not.toThrow();
  });

  it("dix photos existantes : TropDePhotos « Maximum de 10 photos atteint »", () => {
    expect(() => verifierCapacite(existantes(MAX_PHOTOS), photoDe(100))).toThrow(TropDePhotos);
    expect(() => verifierCapacite(existantes(MAX_PHOTOS), photoDe(100))).toThrow("Maximum de 10 photos atteint");
  });

  it("le nombre est contrôlé avant le poids", () => {
    expect(() => verifierCapacite(existantes(MAX_PHOTOS, MAX_PHOTO_OCTETS), photoDe(MAX_PHOTO_OCTETS))).toThrow(
      TropDePhotos
    );
  });

  it("8 Mo cumulés exactement : acceptés ; un octet de plus : PhotosTropLourdes", () => {
    const trois = existantes(3, MAX_PHOTO_OCTETS);
    expect(() => verifierCapacite(trois, photoDe(MAX_PHOTOS_OCTETS_CUMULES - 3 * MAX_PHOTO_OCTETS))).not.toThrow();
    expect(() => verifierCapacite(trois, photoDe(MAX_PHOTOS_OCTETS_CUMULES - 3 * MAX_PHOTO_OCTETS + 1))).toThrow(
      PhotosTropLourdes
    );
    expect(() => verifierCapacite([...trois, { url: photoDe(MAX_PHOTO_OCTETS) }], photoDe(23))).toThrow(
      "Les photos de cette opération dépassent 8 Mo au total."
    );
  });

  it("une photo existante sans URL compte pour zéro octet", () => {
    expect(() => verifierCapacite([{}, { url: undefined }], photoDe(MAX_PHOTO_OCTETS))).not.toThrow();
  });
});
```

```ts
// src/backend/operations/domain/changement-statut.test.ts
import { describe, it, expect } from "vitest";
import { messageAlerteCoherence, terminaisonSansEnCours } from "./changement-statut";

describe("terminaisonSansEnCours", () => {
  it.each(["Planifiée", "Affectée", "En route", "Retardée", "Terminée"] as const)(
    "%s → Terminée : incohérent",
    (ancien) => {
      expect(terminaisonSansEnCours(ancien, "Terminée")).toBe(true);
    }
  );

  it("En cours → Terminée : cohérent", () => {
    expect(terminaisonSansEnCours("En cours", "Terminée")).toBe(false);
  });

  it("vers un autre statut que Terminée : jamais d'alerte", () => {
    expect(terminaisonSansEnCours("Planifiée", "Annulée")).toBe(false);
    expect(terminaisonSansEnCours("Terminée", "Rapportée")).toBe(false);
  });
});

describe("messageAlerteCoherence", () => {
  it("message exact du journal", () => {
    expect(messageAlerteCoherence("abc123", "Retardée")).toBe(
      "[cohérence] Opération abc123 passée Terminée sans En cours (était Retardée)"
    );
  });
});
```

Run : `npx vitest run src/backend/operations/domain/photos.test.ts src/backend/operations/domain/changement-statut.test.ts` → FAIL (modules `./photos` et `./changement-statut` introuvables).

- [ ] **Step 3 : Écrire les règles**

```ts
// src/backend/operations/domain/photos.ts
import { FormatPhotoInvalide, PhotoRequise, PhotoTropLourde, PhotosTropLourdes, TropDePhotos } from "./erreurs";

/**
 * Les photos sont stockées en base64 dans le document de l'opération (limite BSON de 16 Mo).
 * Plafonds volontairement bas pour garder de la marge : 2 Mo par photo et 8 Mo cumulés par
 * opération, mesurés sur la charge utile réellement stockée ; 10 photos au plus.
 */
export const MAX_PHOTO_OCTETS = 2 * 1024 * 1024;
export const MAX_PHOTOS_OCTETS_CUMULES = 8 * 1024 * 1024;
export const MAX_PHOTOS = 10;

export function octetsStockes(dataUrl: string): number {
  return Buffer.byteLength(dataUrl, "utf8");
}

/** Contrôles faits avant toute lecture de l'opération : présence, format, poids. Renvoie l'URL validée. */
export function validerNouvellePhoto(photo: unknown): string {
  if (!photo || typeof photo !== "string") throw new PhotoRequise();
  if (!photo.startsWith("data:image/")) throw new FormatPhotoInvalide();
  if (octetsStockes(photo) > MAX_PHOTO_OCTETS) throw new PhotoTropLourde();
  return photo;
}

/** Contrôles faits sur l'opération lue : d'abord le nombre, puis le poids cumulé. */
export function verifierCapacite(existantes: { url?: string }[], nouvelle: string): void {
  if (existantes.length >= MAX_PHOTOS) throw new TropDePhotos();
  const cumul = existantes.reduce((somme, photo) => somme + octetsStockes(photo.url ?? ""), 0);
  if (cumul + octetsStockes(nouvelle) > MAX_PHOTOS_OCTETS_CUMULES) throw new PhotosTropLourdes();
}
```

```ts
// src/backend/operations/domain/changement-statut.ts
import type { OperationStatus } from "@/shared/operations/statuts";
import type { QuantiteUnite } from "@/shared/operations/quantites";

/** Données saisies sur le terrain ; une clé absente laisse la valeur stockée intacte. */
export interface DonneesTerrain {
  quantiteCollectee?: number;
  uniteQuantite?: QuantiteUnite;
  remarquesTerrain?: string;
  nomSignataireClient?: string;
  signatureClient?: string;
  /** Fourni : remplace toutes les photos de l'opération. */
  photos?: { url: string; nom?: string }[];
}

export interface DemandeChangementStatut extends DonneesTerrain {
  statut: OperationStatus;
}

/** Changement validé, prêt à être enregistré avec son entrée d'historique. */
export interface ChangementStatut extends DemandeChangementStatut {
  ancienStatut: OperationStatus;
  date: Date;
  parUtilisateur: string;
}

/** Ce qu'il faut savoir d'une opération pour autoriser une écriture de terrain. */
export interface EtatTerrain {
  statut: OperationStatus;
  /** Absent : jamais affectée. */
  equipeId?: string | null;
  photos: { url?: string }[];
}

/** Règle métier n°4 : une opération terminée sans être passée par « En cours » est signalée (non bloquant). */
export function terminaisonSansEnCours(ancien: OperationStatus, nouveau: OperationStatus): boolean {
  return nouveau === "Terminée" && ancien !== "En cours";
}

export function messageAlerteCoherence(operationId: string, ancien: OperationStatus): string {
  return `[cohérence] Opération ${operationId} passée Terminée sans En cours (était ${ancien})`;
}
```

Run : `npx vitest run src/backend/operations/domain/photos.test.ts src/backend/operations/domain/changement-statut.test.ts` → PASS (**17 + 8 = 25 tests**).

- [ ] **Step 4 : Vérification et commit**

Run : `npx tsc --noEmit && npm run lint && npx vitest run` → vert, **1163 tests**.

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!package.json'
git status
git commit -m "refactor(operations): règles pures des photos et de l'alerte de cohérence, erreurs métier de terrain"
```

---

### Task 3 : Dépôt — état terrain, changement de statut, photos

**Files:**
- Modify: `src/backend/operations/domain/ports.ts`, `src/backend/operations/infrastructure/mongoose/operation.repository.mongoose.ts`, `src/backend/operations/infrastructure/mongoose/operation.repository.mongoose.test.ts`, `src/backend/operations/infrastructure/en-memoire/operation.repository.en-memoire.ts`

**Interfaces:**
- Consomme : `ChangementStatut`, `EtatTerrain` (tâche 2) ; `PhotoOperation`, `Operation` (R4b).
- Produit (ajouts à `OperationRepository`, implémentés par l'adaptateur Mongoose **et** par le faux en mémoire) :
  ```ts
  trouverEtatTerrain(id: string): Promise<EtatTerrain | null>;
  changerStatut(id: string, changement: ChangementStatut): Promise<Operation | null>;   // niveau « terrain »
  ajouterPhoto(id: string, photo: PhotoOperation): Promise<boolean>;
  retirerPhotos(id: string, url: string): Promise<boolean>;
  // domain/ports.ts
  export type AlerteCoherence = (message: string) => void;
  ```

- [ ] **Step 1 : Compléter le port**

Dans `src/backend/operations/domain/ports.ts`, ajouter l'import :

```ts
import type { ChangementStatut, EtatTerrain } from "./changement-statut";
```

ajouter `PhotoOperation` à la liste importée de `./operation`, ajouter ces quatre méthodes **à la fin de l'interface `OperationRepository`** :

```ts
  /** État brut (relations non peuplées) nécessaire aux écritures de terrain ; null si l'opération n'existe pas. */
  trouverEtatTerrain(id: string): Promise<EtatTerrain | null>;
  /**
   * Applique le statut, les données de terrain fournies et ajoute l'entrée d'historique en un seul
   * enregistrement ; niveau « terrain » (site avec adresse, équipements avec nom) ; null si absente.
   */
  changerStatut(id: string, changement: ChangementStatut): Promise<Operation | null>;
  /** Ajoute la photo à la suite ; false si l'opération n'existe pas. */
  ajouterPhoto(id: string, photo: PhotoOperation): Promise<boolean>;
  /** Retire toutes les photos portant cette URL (aucune : sans effet) ; false si l'opération n'existe pas. */
  retirerPhotos(id: string, url: string): Promise<boolean>;
```

et, à la fin du fichier :

```ts
/** Signalement non bloquant d'une incohérence métier (journal). */
export type AlerteCoherence = (message: string) => void;
```

- [ ] **Step 2 : Test de contrat (échec attendu)**

Dans `operation.repository.mongoose.test.ts`, ajouter l'import `import type { ChangementStatut } from "../../domain/changement-statut";`, puis ajouter à la fin du `describe("OperationRepositoryMongoose (contrat)", …)` (avant sa dernière `});`) :

```ts
  describe("trouverEtatTerrain", () => {
    it("statut, équipe en identifiant brut, URL des photos", async () => {
      const { id } = await depot.creer(saisie({ equipeId, vehiculeId }), initial("Affectée"));
      await OperationModel.updateOne({ _id: id }, { photos: [{ url: "data:image/jpeg;base64,AAAA", nom: "a.jpg" }] });

      const etat = await depot.trouverEtatTerrain(id);

      expect(etat).toEqual({ statut: "Affectée", equipeId, photos: [{ url: "data:image/jpeg;base64,AAAA" }] });
    });

    it("opération sans équipe : `equipeId` absent", async () => {
      const { id } = await depot.creer(saisie(), initial());
      const etat = await depot.trouverEtatTerrain(id);
      expect(etat?.equipeId).toBeUndefined();
      expect(etat?.photos).toEqual([]);
    });

    it("null si l'opération n'existe pas", async () => {
      expect(await depot.trouverEtatTerrain(String(new mongoose.Types.ObjectId()))).toBeNull();
    });
  });

  describe("changerStatut", () => {
    // Typage volontairement lâche en entrée : un test passe une unité vide, que le type du domaine interdit.
    const changement = (surcharge: Record<string, unknown> = {}) =>
      ({
        statut: "En route",
        ancienStatut: "Affectée",
        date: j("02"),
        parUtilisateur: userId,
        ...surcharge,
      }) as unknown as ChangementStatut;

    it("applique le statut, ajoute l'entrée d'historique, renvoie le niveau terrain, incrémente la révision", async () => {
      const { id } = await depot.creer(saisie({ equipeId, vehiculeId, equipementIds: [equipementA] }), initial("Affectée"));

      const operation = await depot.changerStatut(id, changement());

      expect(operation).toMatchObject({
        id,
        statut: "En route",
        clientId: { id: clientId, nom: "Client A" },
        siteId: { id: siteId, nom: "Site A", adresse: "Rue 1" },
        equipeId: { id: equipeId, nom: "Équipe A" },
        vehiculeId: { id: vehiculeId, identification: "V-001" },
        equipementIds: [{ id: equipementA, nom: "Pompe" }],
        revision: 1,
      });
      expect(operation?.equipementIds[0]).not.toHaveProperty("type");
      expect(operation?.historiqueStatuts).toEqual([
        { statut: "Affectée", date: MAINTENANT, parUtilisateur: userId },
        { statut: "En route", date: j("02"), parUtilisateur: userId, ancienStatut: "Affectée" },
      ]);
    });

    it("données de terrain fournies : appliquées ; les photos fournies remplacent les existantes", async () => {
      const { id } = await depot.creer(saisie(), initial());
      await OperationModel.updateOne({ _id: id }, { photos: [{ url: "data:image/jpeg;base64,ANCIENNE", nom: "ancienne.jpg" }] });

      const operation = await depot.changerStatut(
        id,
        changement({
          statut: "Terminée",
          ancienStatut: "En cours",
          quantiteCollectee: 12.5,
          uniteQuantite: "Kg",
          remarquesTerrain: "RAS",
          nomSignataireClient: "M. Koné",
          signatureClient: "sig",
          photos: [{ url: "data:image/jpeg;base64,BBBB", nom: "cuve.jpg" }, { url: "data:image/jpeg;base64,CCCC" }],
        })
      );

      expect(operation).toMatchObject({
        statut: "Terminée",
        quantiteCollectee: 12.5,
        uniteQuantite: "Kg",
        remarquesTerrain: "RAS",
        nomSignataireClient: "M. Koné",
        signatureClient: "sig",
      });
      expect(operation?.photos).toEqual([
        { url: "data:image/jpeg;base64,BBBB", nom: "cuve.jpg", uploadedAt: expect.any(Date) },
        { url: "data:image/jpeg;base64,CCCC", nom: "", uploadedAt: expect.any(Date) },
      ]);
    });

    it("données omises : conservées ; chaîne vide et tableau vide fournis : appliqués ; unité vide : ignorée", async () => {
      const { id } = await depot.creer(saisie(), initial());
      await OperationModel.updateOne(
        { _id: id },
        {
          quantiteCollectee: 12.5,
          uniteQuantite: "Kg",
          remarquesTerrain: "RAS",
          nomSignataireClient: "M. Koné",
          signatureClient: "sig",
          photos: [{ url: "data:image/jpeg;base64,AAAA", nom: "a.jpg" }],
        }
      );

      const conserve = await depot.changerStatut(id, changement());
      expect(conserve).toMatchObject({
        quantiteCollectee: 12.5,
        uniteQuantite: "Kg",
        remarquesTerrain: "RAS",
        nomSignataireClient: "M. Koné",
        signatureClient: "sig",
      });
      expect(conserve?.photos).toHaveLength(1);

      const vide = await depot.changerStatut(
        id,
        changement({ remarquesTerrain: "", nomSignataireClient: "", signatureClient: "", photos: [], uniteQuantite: "" })
      );
      expect(vide).toMatchObject({ remarquesTerrain: "", nomSignataireClient: "", signatureClient: "", photos: [] });
      expect(vide?.quantiteCollectee).toBe(12.5);
      expect(vide?.uniteQuantite).toBe("Kg");
    });

    it("null si l'opération n'existe pas", async () => {
      expect(await depot.changerStatut(String(new mongoose.Types.ObjectId()), changement())).toBeNull();
    });
  });

  describe("photos", () => {
    const photo = (nom: string, url = "data:image/jpeg;base64,AAAA") => ({ url, nom, uploadedAt: j("02") });
    const revision = async (id: string) => ((await OperationModel.findById(id).lean()) as unknown as { __v: number }).__v;

    it("ajouterPhoto : ajoute à la suite, incrémente la révision", async () => {
      const { id } = await depot.creer(saisie(), initial());

      expect(await depot.ajouterPhoto(id, photo("a.jpg"))).toBe(true);
      expect(await depot.ajouterPhoto(id, photo("b.jpg"))).toBe(true);

      expect((await depot.trouverDetailParId(id))?.photos).toEqual([photo("a.jpg"), photo("b.jpg")]);
      expect(await revision(id)).toBe(2);
    });

    it("ajouterPhoto : false si l'opération n'existe pas", async () => {
      expect(await depot.ajouterPhoto(String(new mongoose.Types.ObjectId()), photo("a.jpg"))).toBe(false);
    });

    it("retirerPhotos : retire toutes les photos portant l'URL, incrémente la révision", async () => {
      const { id } = await depot.creer(saisie(), initial());
      await depot.ajouterPhoto(id, photo("a.jpg", "data:image/jpeg;base64,UN"));
      await depot.ajouterPhoto(id, photo("b.jpg", "data:image/jpeg;base64,DEUX"));
      await depot.ajouterPhoto(id, photo("c.jpg", "data:image/jpeg;base64,UN"));

      expect(await depot.retirerPhotos(id, "data:image/jpeg;base64,UN")).toBe(true);

      expect((await depot.trouverDetailParId(id))?.photos.map((p) => p.nom)).toEqual(["b.jpg"]);
      expect(await revision(id)).toBe(4);
    });

    it("retirerPhotos : URL inconnue, succès sans effet ni changement de révision", async () => {
      const { id } = await depot.creer(saisie(), initial());
      await depot.ajouterPhoto(id, photo("a.jpg"));

      expect(await depot.retirerPhotos(id, "data:image/jpeg;base64,INCONNUE")).toBe(true);

      expect((await depot.trouverDetailParId(id))?.photos).toHaveLength(1);
      expect(await revision(id)).toBe(1);
    });

    it("retirerPhotos : false si l'opération n'existe pas", async () => {
      expect(await depot.retirerPhotos(String(new mongoose.Types.ObjectId()), "x")).toBe(false);
    });
  });
```

Run : `npx vitest run src/backend/operations/infrastructure/mongoose/operation.repository.mongoose.test.ts` → FAIL (`depot.trouverEtatTerrain is not a function`, etc. ; `tsc` signale aussi les méthodes manquantes).

- [ ] **Step 3 : Compléter l'adaptateur Mongoose**

Dans `operation.repository.mongoose.ts` : ajouter l'import

```ts
import type { ChangementStatut, EtatTerrain } from "../../domain/changement-statut";
```

ajouter, après la constante `DETAIL` :

```ts
// Réponse d'un changement de statut : comme la liste, plus le nom des équipements.
const TERRAIN: Peuplement[] = [
  { path: "clientId", select: "nom" },
  { path: "siteId", select: "nom adresse" },
  { path: "equipeId", select: "nom" },
  { path: "vehiculeId", select: "identification" },
  { path: "equipementIds", select: "nom" },
];
```

et ajouter ces quatre méthodes à la fin de la classe `OperationRepositoryMongoose` :

```ts
  async trouverEtatTerrain(id: string): Promise<EtatTerrain | null> {
    await connectDB();
    const doc = (await OperationModel.findById(id).lean()) as unknown as DocumentOperation | null;
    if (!doc) return null;
    const etat: EtatTerrain = {
      statut: doc.statut ?? "Planifiée",
      photos: (doc.photos ?? []).map((photo) => ({ url: photo.url })),
    };
    if (doc.equipeId !== undefined) etat.equipeId = doc.equipeId === null ? null : String(doc.equipeId);
    return etat;
  }

  // Les trois écritures suivantes chargent le document, le modifient et l'enregistrent (`save()`),
  // comme les routes d'origine : la révision `__v` renvoyée aux clients en dépend.

  async changerStatut(id: string, changement: ChangementStatut): Promise<Operation | null> {
    await connectDB();
    const doc = await OperationModel.findById(id);
    if (!doc) return null;

    doc.statut = changement.statut;
    if (changement.quantiteCollectee !== undefined) doc.quantiteCollectee = changement.quantiteCollectee;
    // Véracité (et non `!== undefined`) : une unité vide est ignorée, comme dans la route d'origine.
    if (changement.uniteQuantite) doc.uniteQuantite = changement.uniteQuantite;
    if (changement.remarquesTerrain !== undefined) doc.remarquesTerrain = changement.remarquesTerrain;
    if (changement.nomSignataireClient !== undefined) doc.nomSignataireClient = changement.nomSignataireClient;
    if (changement.signatureClient !== undefined) doc.signatureClient = changement.signatureClient;
    if (changement.photos !== undefined) doc.photos = changement.photos;

    doc.historiqueStatuts.push({
      statut: changement.statut,
      date: changement.date,
      parUtilisateur: new mongoose.Types.ObjectId(changement.parUtilisateur),
      ancienStatut: changement.ancienStatut,
    });

    await doc.save();

    const relu = (await OperationModel.findById(id).populate(TERRAIN).lean()) as unknown as DocumentOperation;
    return versEntite(relu);
  }

  async ajouterPhoto(id: string, photo: PhotoOperation): Promise<boolean> {
    await connectDB();
    const doc = await OperationModel.findById(id);
    if (!doc) return false;
    doc.photos.push(photo);
    await doc.save();
    return true;
  }

  async retirerPhotos(id: string, url: string): Promise<boolean> {
    await connectDB();
    const doc = await OperationModel.findById(id);
    if (!doc) return false;
    doc.photos = doc.photos.filter((photo: { url: string }) => photo.url !== url);
    await doc.save();
    return true;
  }
```

- [ ] **Step 4 : Compléter le faux en mémoire**

Dans `operation.repository.en-memoire.ts` : ajouter les imports

```ts
import type { ChangementStatut, EtatTerrain } from "../../domain/changement-statut";
```

et `type PhotoOperation` à la liste importée de `../../domain/operation` ; ajouter ces méthodes à la fin de la classe :

```ts
  async trouverEtatTerrain(id: string): Promise<EtatTerrain | null> {
    const operation = this.donnees.get(id);
    if (!operation) return null;
    const etat: EtatTerrain = { statut: operation.statut, photos: operation.photos.map(({ url }) => ({ url })) };
    const equipeId = idDeReference(operation.equipeId);
    if (equipeId !== undefined) etat.equipeId = equipeId;
    return etat;
  }

  async changerStatut(id: string, changement: ChangementStatut): Promise<Operation | null> {
    const existante = this.donnees.get(id);
    if (!existante) return null;
    const modifiee: Operation = {
      ...existante,
      statut: changement.statut,
      historiqueStatuts: [
        ...existante.historiqueStatuts,
        {
          statut: changement.statut,
          date: changement.date,
          parUtilisateur: changement.parUtilisateur,
          ancienStatut: changement.ancienStatut,
        },
      ],
    };
    if (changement.quantiteCollectee !== undefined) modifiee.quantiteCollectee = changement.quantiteCollectee;
    if (changement.uniteQuantite) modifiee.uniteQuantite = changement.uniteQuantite;
    if (changement.remarquesTerrain !== undefined) modifiee.remarquesTerrain = changement.remarquesTerrain;
    if (changement.nomSignataireClient !== undefined) modifiee.nomSignataireClient = changement.nomSignataireClient;
    if (changement.signatureClient !== undefined) modifiee.signatureClient = changement.signatureClient;
    if (changement.photos !== undefined) {
      modifiee.photos = changement.photos.map((photo) => ({
        url: photo.url,
        nom: photo.nom ?? "",
        uploadedAt: changement.date,
      }));
    }
    this.donnees.set(id, modifiee);
    return modifiee;
  }

  async ajouterPhoto(id: string, photo: PhotoOperation): Promise<boolean> {
    const existante = this.donnees.get(id);
    if (!existante) return false;
    this.donnees.set(id, { ...existante, photos: [...existante.photos, photo] });
    return true;
  }

  async retirerPhotos(id: string, url: string): Promise<boolean> {
    const existante = this.donnees.get(id);
    if (!existante) return false;
    this.donnees.set(id, { ...existante, photos: existante.photos.filter((photo) => photo.url !== url) });
    return true;
  }
```

- [ ] **Step 5 : Vérifier**

Run : `npx vitest run src/backend/operations/infrastructure/mongoose/operation.repository.mongoose.test.ts` → PASS (**30 tests** : 18 de R4b + 12).

Si un test échoue, **corriger le dépôt, pas le test** : chaque assertion reproduit un comportement constaté des routes d'origine.

- [ ] **Step 6 : Vérification et commit**

Run : `npx tsc --noEmit && npm run lint && npx vitest run` → vert, **1175 tests**.

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!package.json'
git status
git commit -m "refactor(operations): dépôt — état terrain, changement de statut avec historique, ajout et retrait de photos"
```

---

### Task 4 : Cas d'usage « terrain » et défense en profondeur du périmètre

**Files:**
- Create: `src/backend/operations/application/cas-d-usage-terrain.ts`, `src/backend/operations/application/cas-d-usage-terrain.test.ts`
- Modify: `src/backend/operations/domain/visibilite.ts`, `src/backend/operations/domain/visibilite.test.ts`, `src/backend/operations/application/cas-d-usage.ts`, `src/backend/operations/application/cas-d-usage.test.ts`, `src/backend/operations/composition.ts`

**Interfaces:**
- Consomme : tâches 2 et 3 ; `canTransition` (`@/shared/operations/transitions`) ; `chauffeurSansEquipe`, `peutAgirSurOperation` (R4a) ; `Horloge`, `OperationRepository` (R4b).
- Produit :
  ```ts
  // domain/visibilite.ts
  export function compteClientSansPerimetre(acteur: Acteur): boolean;
  // application/cas-d-usage-terrain.ts
  export interface DependancesTerrain { operations: OperationRepository; horloge: Horloge; alerteCoherence: AlerteCoherence }
  export function creerCasDUsageTerrain(deps: DependancesTerrain): {
    verifierAccesTerrain(acteur: Acteur): void;                                                       // lève ChauffeurSansEquipe
    changerStatut(acteur: Acteur, id: string, demande: DemandeChangementStatut): Promise<Operation>;
    ajouterPhoto(acteur: Acteur, id: string, envoi: { photo?: unknown; nom?: unknown }): Promise<PhotoOperation>;
    retirerPhoto(acteur: Acteur, id: string, url: unknown): Promise<void>;
  };
  // composition.ts
  export const casDUsageTerrain: ReturnType<typeof creerCasDUsageTerrain>;
  ```
  Le droit d'écriture terrain (`admin`, `dispatcher`, `chauffeur`) reste vérifié par `requireTerrainWrite()` dans le contrôleur.

- [ ] **Step 1 : Tests (échec attendu)**

```ts
// src/backend/operations/application/cas-d-usage-terrain.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import type { Acteur } from "@/shared/acces/acteur";
import {
  ChauffeurSansEquipe,
  FormatPhotoInvalide,
  OperationHorsEquipe,
  OperationIntrouvable,
  PhotoRequise,
  PhotosTropLourdes,
  TransitionInterdite,
  TropDePhotos,
  UrlPhotoRequise,
} from "../domain/erreurs";
import type { Operation } from "../domain/operation";
import { OperationRepositoryEnMemoire } from "../infrastructure/en-memoire/operation.repository.en-memoire";
import { creerCasDUsageTerrain } from "./cas-d-usage-terrain";

const MAINTENANT = new Date("2030-11-01T12:00:00.000Z");
const PHOTO = "data:image/jpeg;base64,AAAA";
const photoDe = (octets: number) => "data:image/jpeg;base64,".padEnd(octets, "A");

const admin: Acteur = { id: "u-admin", role: "admin" };
const chauffeur: Acteur = { id: "u-chauffeur", role: "chauffeur", equipeId: "equipe-a" };
const chauffeurSansEquipe: Acteur = { id: "u-chauffeur", role: "chauffeur" };

describe("cas d'usage de terrain", () => {
  let operations: OperationRepositoryEnMemoire;
  let alertes: string[];
  let casDUsage: ReturnType<typeof creerCasDUsageTerrain>;

  const deposer = (surcharge: Partial<Operation> = {}): Operation => {
    const operation: Operation = {
      id: "operation-1",
      clientId: "client-a",
      siteId: "site-a",
      natureIntervention: "Collecte",
      dateHeurePrevue: new Date("2030-11-02T10:00:00.000Z"),
      dureeEstimeeMinutes: 120,
      equipeId: "equipe-a",
      equipementIds: [],
      informationsParticulieres: "",
      statut: "Affectée",
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

  const lue = async () => (await operations.trouverDetailParId("operation-1")) as Operation;

  beforeEach(() => {
    operations = new OperationRepositoryEnMemoire();
    alertes = [];
    casDUsage = creerCasDUsageTerrain({
      operations,
      horloge: { maintenant: () => MAINTENANT },
      alerteCoherence: (message) => alertes.push(message),
    });
  });

  describe("verifierAccesTerrain", () => {
    it("refuse un chauffeur sans équipe, laisse passer les autres", () => {
      expect(() => casDUsage.verifierAccesTerrain(chauffeurSansEquipe)).toThrow(ChauffeurSansEquipe);
      expect(() => casDUsage.verifierAccesTerrain(chauffeur)).not.toThrow();
      expect(() => casDUsage.verifierAccesTerrain(admin)).not.toThrow();
    });
  });

  describe("changerStatut", () => {
    it("chauffeur sans équipe : refusé", async () => {
      deposer();
      await expect(casDUsage.changerStatut(chauffeurSansEquipe, "operation-1", { statut: "En route" })).rejects.toThrow(
        ChauffeurSansEquipe
      );
    });

    it("introuvable : OperationIntrouvable", async () => {
      await expect(casDUsage.changerStatut(admin, "absente", { statut: "En route" })).rejects.toThrow(OperationIntrouvable);
    });

    it.each([
      ["autre équipe", { equipeId: "equipe-b" }],
      ["opération sans équipe", { equipeId: undefined }],
      ["équipe supprimée (référence pendante)", { equipeId: null }],
    ] as const)("chauffeur, %s : OperationHorsEquipe, rien n'est écrit", async (_cas, surcharge) => {
      deposer(surcharge);
      const tentative = casDUsage.changerStatut(chauffeur, "operation-1", { statut: "En route" });
      await expect(tentative).rejects.toThrow(OperationHorsEquipe);
      await expect(tentative).rejects.toThrow("Opération non affectée à votre équipe");
      expect((await lue()).statut).toBe("Affectée");
    });

    it("l'équipe est contrôlée avant la transition", async () => {
      deposer({ equipeId: "equipe-b", statut: "Planifiée" });
      await expect(casDUsage.changerStatut(chauffeur, "operation-1", { statut: "Terminée" })).rejects.toThrow(
        OperationHorsEquipe
      );
    });

    it("transition interdite : TransitionInterdite, message exact, aucune donnée de terrain écrite", async () => {
      deposer({ statut: "Planifiée" });
      const tentative = casDUsage.changerStatut(admin, "operation-1", { statut: "Terminée", remarquesTerrain: "non" });
      await expect(tentative).rejects.toThrow(TransitionInterdite);
      await expect(tentative).rejects.toThrow("Transition Planifiée → Terminée non autorisée");
      expect(await lue()).toMatchObject({ statut: "Planifiée", remarquesTerrain: "", historiqueStatuts: [] });
    });

    it("succès : statut appliqué, entrée d'historique datée par l'horloge et signée par l'acteur", async () => {
      deposer();
      const operation = await casDUsage.changerStatut(chauffeur, "operation-1", { statut: "En route" });
      expect(operation.statut).toBe("En route");
      expect(operation.historiqueStatuts).toEqual([
        { statut: "En route", date: MAINTENANT, parUtilisateur: "u-chauffeur", ancienStatut: "Affectée" },
      ]);
    });

    it("données de terrain transmises au dépôt", async () => {
      deposer({ statut: "En cours" });
      const operation = await casDUsage.changerStatut(admin, "operation-1", {
        statut: "Terminée",
        quantiteCollectee: 12.5,
        uniteQuantite: "Kg",
        remarquesTerrain: "RAS",
        photos: [{ url: PHOTO }],
      });
      expect(operation).toMatchObject({
        statut: "Terminée",
        quantiteCollectee: 12.5,
        uniteQuantite: "Kg",
        remarquesTerrain: "RAS",
        photos: [{ url: PHOTO, nom: "", uploadedAt: MAINTENANT }],
      });
    });

    it("même statut : accepté, entrée d'historique avec l'ancien statut identique", async () => {
      deposer({ statut: "Planifiée" });
      const operation = await casDUsage.changerStatut(admin, "operation-1", { statut: "Planifiée" });
      expect(operation.historiqueStatuts).toEqual([
        { statut: "Planifiée", date: MAINTENANT, parUtilisateur: "u-admin", ancienStatut: "Planifiée" },
      ]);
    });

    it("Terminée sans En cours : acceptée et signalée ; depuis En cours : aucune alerte", async () => {
      deposer({ statut: "Retardée" });
      await casDUsage.changerStatut(admin, "operation-1", { statut: "Terminée" });
      expect(alertes).toEqual(["[cohérence] Opération operation-1 passée Terminée sans En cours (était Retardée)"]);

      deposer({ statut: "En cours" });
      await casDUsage.changerStatut(admin, "operation-1", { statut: "Terminée" });
      expect(alertes).toHaveLength(1);
    });
  });

  describe("ajouterPhoto", () => {
    it("chauffeur sans équipe : refusé", async () => {
      deposer();
      await expect(casDUsage.ajouterPhoto(chauffeurSansEquipe, "operation-1", { photo: PHOTO })).rejects.toThrow(
        ChauffeurSansEquipe
      );
    });

    it("la forme de la photo est contrôlée avant de chercher l'opération", async () => {
      await expect(casDUsage.ajouterPhoto(admin, "absente", {})).rejects.toThrow(PhotoRequise);
      await expect(casDUsage.ajouterPhoto(admin, "absente", { photo: "https://x.ci/p.jpg" })).rejects.toThrow(
        FormatPhotoInvalide
      );
    });

    it("introuvable : OperationIntrouvable", async () => {
      await expect(casDUsage.ajouterPhoto(admin, "absente", { photo: PHOTO })).rejects.toThrow(OperationIntrouvable);
    });

    it("chauffeur d'une autre équipe : OperationHorsEquipe, rien n'est ajouté", async () => {
      deposer({ equipeId: "equipe-b" });
      await expect(casDUsage.ajouterPhoto(chauffeur, "operation-1", { photo: PHOTO })).rejects.toThrow(OperationHorsEquipe);
      expect((await lue()).photos).toEqual([]);
    });

    it("succès : photo nommée, datée par l'horloge, ajoutée à la suite", async () => {
      deposer({ photos: [{ url: `${PHOTO}0`, nom: "a.jpg", uploadedAt: MAINTENANT }] });
      const photo = await casDUsage.ajouterPhoto(chauffeur, "operation-1", { photo: PHOTO, nom: "cuve.jpg" });
      expect(photo).toEqual({ url: PHOTO, nom: "cuve.jpg", uploadedAt: MAINTENANT });
      expect((await lue()).photos.map((p) => p.nom)).toEqual(["a.jpg", "cuve.jpg"]);
    });

    it.each([undefined, ""])("nom %j : « photo-<horodatage>.jpg »", async (nom) => {
      deposer();
      const photo = await casDUsage.ajouterPhoto(admin, "operation-1", { photo: PHOTO, nom });
      expect(photo.nom).toBe(`photo-${MAINTENANT.getTime()}.jpg`);
    });

    it("dix photos : TropDePhotos, rien n'est ajouté", async () => {
      deposer({
        photos: Array.from({ length: 10 }, (_, i) => ({ url: `${PHOTO}${i}`, nom: `p${i}.jpg`, uploadedAt: MAINTENANT })),
      });
      await expect(casDUsage.ajouterPhoto(admin, "operation-1", { photo: PHOTO })).rejects.toThrow(TropDePhotos);
      expect((await lue()).photos).toHaveLength(10);
    });

    it("poids cumulé dépassé : PhotosTropLourdes", async () => {
      deposer({
        photos: [1, 2, 3, 4].map((n) => ({ url: photoDe(2 * 1024 * 1024), nom: `p${n}.jpg`, uploadedAt: MAINTENANT })),
      });
      await expect(casDUsage.ajouterPhoto(admin, "operation-1", { photo: PHOTO })).rejects.toThrow(PhotosTropLourdes);
    });
  });

  describe("retirerPhoto", () => {
    it.each([undefined, ""])("URL %j : UrlPhotoRequise, avant de chercher l'opération", async (url) => {
      await expect(casDUsage.retirerPhoto(admin, "absente", url)).rejects.toThrow(UrlPhotoRequise);
    });

    it("introuvable : OperationIntrouvable", async () => {
      await expect(casDUsage.retirerPhoto(admin, "absente", PHOTO)).rejects.toThrow(OperationIntrouvable);
    });

    it("chauffeur d'une autre équipe : OperationHorsEquipe, la photo reste", async () => {
      deposer({ equipeId: "equipe-b", photos: [{ url: PHOTO, nom: "a.jpg", uploadedAt: MAINTENANT }] });
      await expect(casDUsage.retirerPhoto(chauffeur, "operation-1", PHOTO)).rejects.toThrow(OperationHorsEquipe);
      expect((await lue()).photos).toHaveLength(1);
    });

    it("retire la photo ; une URL inconnue réussit sans effet", async () => {
      deposer({ photos: [{ url: PHOTO, nom: "a.jpg", uploadedAt: MAINTENANT }] });
      await expect(casDUsage.retirerPhoto(chauffeur, "operation-1", "data:image/jpeg;base64,INCONNUE")).resolves.toBeUndefined();
      expect((await lue()).photos).toHaveLength(1);
      await casDUsage.retirerPhoto(chauffeur, "operation-1", PHOTO);
      expect((await lue()).photos).toEqual([]);
    });
  });
});
```

Ajouter dans `src/backend/operations/domain/visibilite.test.ts` — l'import de `compteClientSansPerimetre` dans la liste importée de `./visibilite`, et ce bloc avant le `describe("messages", …)` :

```ts
describe("compteClientSansPerimetre", () => {
  it("vrai seulement pour un compte client sans client", () => {
    expect(compteClientSansPerimetre(acteur("client"))).toBe(true);
    expect(compteClientSansPerimetre(acteur("client", { clientId: "" }))).toBe(true);
    expect(compteClientSansPerimetre(acteur("client", { clientId: "client-a" }))).toBe(false);
    expect(compteClientSansPerimetre(acteur("admin"))).toBe(false);
    expect(compteClientSansPerimetre(acteur("chauffeur"))).toBe(false);
  });
});
```

Ajouter dans `src/backend/operations/application/cas-d-usage.test.ts` — `CompteClientSansPerimetre` dans la liste importée de `../domain/erreurs`, et ce bloc à la fin du `describe("cas d'usage des opérations", …)` (avant sa dernière `});`) :

```ts
  describe("défense en profondeur : compte client sans périmètre", () => {
    const clientSansPerimetre: Acteur = { id: "u-client", role: "client" };

    it("refusé avant toute lecture, sur la liste, le détail et le planning", async () => {
      deposer({ id: "operation-1" });
      await expect(casDUsage.lister(clientSansPerimetre, {}, PAGE)).rejects.toThrow(CompteClientSansPerimetre);
      await expect(casDUsage.obtenir(clientSansPerimetre, "operation-1")).rejects.toThrow(CompteClientSansPerimetre);
      await expect(casDUsage.planning(clientSansPerimetre, {})).rejects.toThrow(CompteClientSansPerimetre);
      expect(operations.filtresRecus).toHaveLength(0);
    });

    it("message : celui de la garde d'authentification", () => {
      expect(() => casDUsage.verifierAccesLecture(clientSansPerimetre)).toThrow("Compte client sans périmètre attribué");
    });
  });
```

Run : `npx vitest run src/backend/operations/application src/backend/operations/domain/visibilite.test.ts` → FAIL (module `./cas-d-usage-terrain` introuvable ; `compteClientSansPerimetre` et le refus du compte client n'existent pas).

- [ ] **Step 2 : Écrire le code**

Ajouter à `src/backend/operations/domain/visibilite.ts`, après `chauffeurSansEquipe` :

```ts
/** Un compte client sans client ne lit aucune opération (refus avant toute lecture). */
export function compteClientSansPerimetre(acteur: Acteur): boolean {
  return isClientUser(acteur.role) && !acteur.clientId;
}
```

Dans `src/backend/operations/application/cas-d-usage.ts` : ajouter `CompteClientSansPerimetre` à la liste importée de `../domain/erreurs`, `compteClientSansPerimetre` à la liste importée de `../domain/visibilite`, et remplacer la fonction `verifierAccesLecture` par :

```ts
  function verifierAccesLecture(acteur: Acteur): void {
    if (chauffeurSansEquipe(acteur)) throw new ChauffeurSansEquipe();
    // Défense en profondeur : sans ce refus, le filtre de périmètre d'un compte client sans client
    // serait vide et il lirait tout. La garde d'authentification refuse déjà ce compte en amont.
    if (compteClientSansPerimetre(acteur)) throw new CompteClientSansPerimetre();
  }
```

```ts
// src/backend/operations/application/cas-d-usage-terrain.ts
import type { Acteur } from "@/shared/acces/acteur";
import { canTransition } from "@/shared/operations/transitions";
import {
  messageAlerteCoherence,
  terminaisonSansEnCours,
  type DemandeChangementStatut,
  type EtatTerrain,
} from "../domain/changement-statut";
import {
  ChauffeurSansEquipe,
  OperationHorsEquipe,
  OperationIntrouvable,
  TransitionInterdite,
  UrlPhotoRequise,
} from "../domain/erreurs";
import type { Operation, PhotoOperation } from "../domain/operation";
import { validerNouvellePhoto, verifierCapacite } from "../domain/photos";
import type { AlerteCoherence, Horloge, OperationRepository } from "../domain/ports";
import { chauffeurSansEquipe, peutAgirSurOperation } from "../domain/visibilite";

export interface DependancesTerrain {
  operations: OperationRepository;
  horloge: Horloge;
  alerteCoherence: AlerteCoherence;
}

export function creerCasDUsageTerrain({ operations, horloge, alerteCoherence }: DependancesTerrain) {
  function verifierAccesTerrain(acteur: Acteur): void {
    if (chauffeurSansEquipe(acteur)) throw new ChauffeurSansEquipe();
  }

  /** L'opération existe et l'acteur peut y écrire (un chauffeur n'agit que sur les opérations de son équipe). */
  async function etatAccessible(acteur: Acteur, id: string): Promise<EtatTerrain> {
    const etat = await operations.trouverEtatTerrain(id);
    if (!etat) throw new OperationIntrouvable();
    if (!peutAgirSurOperation(acteur, { equipeId: etat.equipeId })) throw new OperationHorsEquipe();
    return etat;
  }

  return {
    verifierAccesTerrain,

    async changerStatut(acteur: Acteur, id: string, demande: DemandeChangementStatut): Promise<Operation> {
      verifierAccesTerrain(acteur);
      const etat = await etatAccessible(acteur, id);

      if (!canTransition(etat.statut, demande.statut)) throw new TransitionInterdite(etat.statut, demande.statut);
      if (terminaisonSansEnCours(etat.statut, demande.statut)) {
        alerteCoherence(messageAlerteCoherence(id, etat.statut));
      }

      const operation = await operations.changerStatut(id, {
        ...demande,
        ancienStatut: etat.statut,
        date: horloge.maintenant(),
        parUtilisateur: acteur.id,
      });
      if (!operation) throw new OperationIntrouvable();
      return operation;
    },

    async ajouterPhoto(acteur: Acteur, id: string, envoi: { photo?: unknown; nom?: unknown }): Promise<PhotoOperation> {
      verifierAccesTerrain(acteur);
      // Forme de la photo contrôlée avant toute lecture (ordre historique : 400/413 avant 404).
      const url = validerNouvellePhoto(envoi.photo);
      const etat = await etatAccessible(acteur, id);
      verifierCapacite(etat.photos, url);

      const maintenant = horloge.maintenant();
      const photo: PhotoOperation = {
        url,
        nom: (envoi.nom || `photo-${maintenant.getTime()}.jpg`) as string,
        uploadedAt: maintenant,
      };
      if (!(await operations.ajouterPhoto(id, photo))) throw new OperationIntrouvable();
      return photo;
    },

    async retirerPhoto(acteur: Acteur, id: string, url: unknown): Promise<void> {
      verifierAccesTerrain(acteur);
      if (!url) throw new UrlPhotoRequise();
      await etatAccessible(acteur, id);
      // La suppression ne porte que sur les photos rattachées à cette opération.
      if (!(await operations.retirerPhotos(id, url as string))) throw new OperationIntrouvable();
    },
  };
}

export type CasDUsageTerrain = ReturnType<typeof creerCasDUsageTerrain>;
```

`src/backend/operations/composition.ts` devient :

```ts
import { SystemClock } from "@/backend/platform/horloge/horloge";
import { creerCasDUsageOperations } from "./application/cas-d-usage";
import { creerCasDUsageTerrain } from "./application/cas-d-usage-terrain";
import { creerVerificationConflits } from "./application/verifier-conflits";
import { AffectationsMongoose } from "./infrastructure/mongoose/affectations.mongoose";
import { OperationRepositoryMongoose } from "./infrastructure/mongoose/operation.repository.mongoose";

const operations = new OperationRepositoryMongoose();
const horloge = new SystemClock();

export const checkAssignmentConflicts = creerVerificationConflits({
  affectations: new AffectationsMongoose(),
});

export const casDUsageOperations = creerCasDUsageOperations({
  operations,
  verifierConflits: checkAssignmentConflicts,
  horloge,
});

export const casDUsageTerrain = creerCasDUsageTerrain({
  operations,
  horloge,
  // Fonction (et non alias direct de `console.warn`) : relit `console.warn` à chaque appel, donc
  // reste observable par un test qui l'espionne après le chargement du module (leçon R3b).
  alerteCoherence: (message) => console.warn(message),
});
```

- [ ] **Step 3 : Vérifier**

Run : `npx vitest run src/backend/operations/application src/backend/operations/domain/visibilite.test.ts tests/architecture` → PASS : `cas-d-usage-terrain.test.ts` **26 tests**, `cas-d-usage.test.ts` **34 tests** (32 + 2), `visibilite.test.ts` **95 tests** (94 + 1), `verifier-conflits.test.ts` inchangé, architecture verte.

- [ ] **Step 4 : Vérification et commit**

Run : `npx tsc --noEmit && npm run lint && npx vitest run` → vert, **1204 tests**.

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!package.json'
git status
git commit -m "refactor(operations): cas d'usage de terrain (statut, photos) ; refus d'un compte client sans périmètre en lecture"
```

---

### Task 5 : Contrôleurs, traduction des erreurs, routes ré-exportées

**Files:**
- Create: `src/backend/operations/http/statut.controleur.ts`, `src/backend/operations/http/photos.controleur.ts`, `src/backend/operations/http/erreurs-http.test.ts`
- Modify: `src/backend/operations/http/erreurs-http.ts`, `src/backend/operations/http/operation.schema.ts`, `src/app/api/operations/[id]/statut/route.ts`, `src/app/api/operations/[id]/photos/route.ts`

**Interfaces:**
- Consomme : `casDUsageTerrain` (tâche 4) ; `versActeur`, `versReponseOperation` (R4b) ; `requireTerrainWrite` (`@/backend/comptes`) ; `guardObjectId`.
- Produit : `PATCH` (`statut.controleur`) ; `POST`, `DELETE` (`photos.controleur`) ; `versDemandeStatut(entree)` ; `versReponseErreur` étendu.

- [ ] **Step 1 : Test de la traduction des erreurs (échec attendu)**

```ts
// src/backend/operations/http/erreurs-http.test.ts
import { describe, it, expect } from "vitest";
import {
  ChauffeurSansEquipe,
  CompteClientSansPerimetre,
  ConflitAffectation,
  FormatPhotoInvalide,
  OperationHorsEquipe,
  OperationIntrouvable,
  PhotoRequise,
  PhotoTropLourde,
  PhotosTropLourdes,
  TransitionInterdite,
  TropDePhotos,
  UrlPhotoRequise,
} from "../domain/erreurs";
import { versReponseErreur } from "./erreurs-http";

describe("versReponseErreur", () => {
  it.each([
    [new ChauffeurSansEquipe(), 403, "Compte chauffeur sans équipe attribuée"],
    [new CompteClientSansPerimetre(), 403, "Compte client sans périmètre attribué"],
    [new OperationHorsEquipe(), 403, "Opération non affectée à votre équipe"],
    [new OperationIntrouvable(), 404, "Non trouvé"],
    [new TransitionInterdite("Planifiée", "Terminée"), 400, "Transition Planifiée → Terminée non autorisée"],
    [new PhotoRequise(), 400, "Photo requise (base64 data URL)"],
    [new FormatPhotoInvalide(), 400, "Format de photo invalide"],
    [new TropDePhotos(), 400, "Maximum de 10 photos atteint"],
    [new UrlPhotoRequise(), 400, "URL de la photo requise"],
    [new PhotoTropLourde(), 413, "La photo dépasse 2 Mo. Réduisez sa taille avant l'envoi."],
    [new PhotosTropLourdes(), 413, "Les photos de cette opération dépassent 8 Mo au total."],
  ] as const)("%o → %i", async (erreur, statut, message) => {
    const reponse = versReponseErreur(erreur);
    expect(reponse.status).toBe(statut);
    expect(await reponse.json()).toEqual({ error: message });
  });

  it("conflit d'affectation → 409 avec la liste des conflits", async () => {
    const conflits = [{ hasConflict: true, message: "L'équipe est déjà affectée à une opération sur ce créneau" }];
    const reponse = versReponseErreur(new ConflitAffectation(conflits));
    expect(reponse.status).toBe(409);
    expect(await reponse.json()).toEqual({ error: "Conflit d'affectation", conflicts: conflits });
  });

  it("toute autre erreur remonte telle quelle", () => {
    const inconnue = new Error("Cast to ObjectId failed");
    expect(() => versReponseErreur(inconnue)).toThrow(inconnue);
    expect(() => versReponseErreur("chaîne")).toThrow();
  });
});
```

Run : `npx vitest run src/backend/operations/http/erreurs-http.test.ts` → FAIL (les nouvelles erreurs remontent au lieu d'être traduites).

- [ ] **Step 2 : Étendre la traduction des erreurs**

`src/backend/operations/http/erreurs-http.ts` devient :

```ts
import { NextResponse } from "next/server";
import {
  ChauffeurSansEquipe,
  CompteClientSansPerimetre,
  ConflitAffectation,
  FormatPhotoInvalide,
  OperationHorsEquipe,
  OperationIntrouvable,
  PhotoRequise,
  PhotoTropLourde,
  PhotosTropLourdes,
  TransitionInterdite,
  TropDePhotos,
  UrlPhotoRequise,
} from "../domain/erreurs";

type ClasseErreur = abstract new (...args: never[]) => Error;

/** Code HTTP de chaque erreur métier ; le corps est toujours `{ error: <message de l'erreur> }`. */
const CODES: [ClasseErreur, number][] = [
  [ChauffeurSansEquipe, 403],
  [CompteClientSansPerimetre, 403],
  [OperationHorsEquipe, 403],
  [OperationIntrouvable, 404],
  [TransitionInterdite, 400],
  [PhotoRequise, 400],
  [FormatPhotoInvalide, 400],
  [TropDePhotos, 400],
  [UrlPhotoRequise, 400],
  [PhotoTropLourde, 413],
  [PhotosTropLourdes, 413],
];

/** Traduit une erreur métier en réponse HTTP ; toute autre erreur remonte telle quelle. */
export function versReponseErreur(erreur: unknown): NextResponse {
  if (erreur instanceof ConflitAffectation) {
    return NextResponse.json({ error: erreur.message, conflicts: erreur.conflits }, { status: 409 });
  }
  for (const [Classe, status] of CODES) {
    if (erreur instanceof Classe) return NextResponse.json({ error: erreur.message }, { status });
  }
  throw erreur;
}
```

Run : `npx vitest run src/backend/operations/http/erreurs-http.test.ts` → PASS (**13 tests**).

- [ ] **Step 3 : Saisie du changement de statut**

Dans `src/backend/operations/http/operation.schema.ts`, ajouter l'import de type

```ts
import type { DemandeChangementStatut } from "../domain/changement-statut";
```

et, à la fin du fichier :

```ts
export type StatusUpdateInput = z.infer<typeof statusUpdateSchema>;

/**
 * Sortie Zod → demande du domaine, sans recopie champ par champ : une clé absente doit rester
 * absente (elle laisse la valeur stockée intacte).
 */
export function versDemandeStatut(entree: StatusUpdateInput): DemandeChangementStatut {
  return entree as DemandeChangementStatut;
}
```

- [ ] **Step 4 : Contrôleurs**

```ts
// src/backend/operations/http/statut.controleur.ts
import { NextRequest, NextResponse } from "next/server";
import { requireTerrainWrite } from "@/backend/comptes";
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { casDUsageTerrain } from "../composition";
import { versActeur } from "./acteur";
import { versReponseErreur } from "./erreurs-http";
import { statusUpdateSchema, versDemandeStatut } from "./operation.schema";
import { versReponseOperation } from "./presentation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireTerrainWrite();
  if (auth.error) return auth.error;
  const acteur = versActeur(auth);

  // Ordre historique : le refus « chauffeur sans équipe » (403) précède le contrôle de l'identifiant (400).
  try {
    casDUsageTerrain.verifierAccesTerrain(acteur);
  } catch (erreur) {
    return versReponseErreur(erreur);
  }

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  const body = await req.json();
  const parsed = statusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const operation = await casDUsageTerrain.changerStatut(acteur, id, versDemandeStatut(parsed.data));
    return NextResponse.json(versReponseOperation(operation));
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}
```

```ts
// src/backend/operations/http/photos.controleur.ts
import { NextRequest, NextResponse } from "next/server";
import { requireTerrainWrite } from "@/backend/comptes";
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { casDUsageTerrain } from "../composition";
import { versActeur } from "./acteur";
import { versReponseErreur } from "./erreurs-http";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireTerrainWrite();
  if (auth.error) return auth.error;
  const acteur = versActeur(auth);

  try {
    casDUsageTerrain.verifierAccesTerrain(acteur);
  } catch (erreur) {
    return versReponseErreur(erreur);
  }

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  const body = await req.json();

  try {
    const photo = await casDUsageTerrain.ajouterPhoto(acteur, id, { photo: body.photo, nom: body.nom });
    return NextResponse.json({ photo }, { status: 201 });
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireTerrainWrite();
  if (auth.error) return auth.error;
  const acteur = versActeur(auth);

  try {
    casDUsageTerrain.verifierAccesTerrain(acteur);
  } catch (erreur) {
    return versReponseErreur(erreur);
  }

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  const body = await req.json();

  try {
    await casDUsageTerrain.retirerPhoto(acteur, id, body.url);
    return NextResponse.json({ success: true });
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}
```

- [ ] **Step 5 : Réduire les deux routes à des ré-exports**

`src/app/api/operations/[id]/statut/route.ts` (contenu intégral) :

```ts
export { PATCH } from "@/backend/operations/http/statut.controleur";
```

`src/app/api/operations/[id]/photos/route.ts` (contenu intégral) :

```ts
export { POST, DELETE } from "@/backend/operations/http/photos.controleur";
```

`src/app/api/operations/[id]/rapport/route.ts` n'est **pas** touché.

- [ ] **Step 6 : Le filet et les tests existants sont l'oracle**

Run : `npx vitest run tests/integration/operations-terrain-caracterisation.test.ts tests/integration/status-workflow.test.ts tests/integration/phase2-import-photos.test.ts tests/integration/chauffeur-scope.test.ts tests/integration/authz-roles.test.ts tests/integration/operations-crud-caracterisation.test.ts`

Expected : tout PASS, **sans avoir modifié aucun de ces fichiers**. Un échec désigne un écart de comportement du nouveau code : le corriger dans `http/`, `application/` ou le dépôt — jamais dans le test.

- [ ] **Step 7 : Vérification complète et commit**

```bash
npx tsc --noEmit && npm run lint && npx vitest run
MONGODB_URI="mongodb://127.0.0.1:9/inexistant" NEXTAUTH_SECRET="verification-build" \
NEXTAUTH_URL="http://localhost:3000" NEXT_TELEMETRY_DISABLED=1 npx next build
git status --short   # la compilation ne doit laisser aucun fichier suivi modifié
```

Expected : vert, **1217 tests** ; compilation Next réussie.

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!package.json'
git status
git commit -m "refactor(operations): contrôleurs statut et photos ; deux routes réduites à des ré-exports"
```

---

### Task 6 : Documentation, statuts et revue du sous-jalon

**Files:** `README.md`, `docs/superpowers/plans/2026-09-20-refactor-architecture-master.md`, `docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md`

- [ ] **Step 1 : README** (paragraphe « État de la migration »). Mettre à jour la phrase sur `operations` : R4a, R4b et **R4c** (changement de statut avec historique et données de terrain, ajout et retrait de photos, règles pures des plafonds de photos) sont réalisés ; seule la route `rapport` (R4d) reste héritée dans `src/app/api/operations/[id]/rapport/`. Dans « Notes de migration » : (a) compléter la cause de l'écart « valeurs par défaut » — il concerne aussi une opération créée avant l'ajout d'un champ au schéma, pas seulement un document écrit hors Mongoose (constat de la revue finale de R4b) ; (b) ajouter le changement délibéré de R4c : un compte client sans `clientId` est refusé par les cas d'usage de lecture (403), chemin inatteignable puisque la garde d'authentification le refuse déjà. Vérifier chaque chemin cité (`ls`).

- [ ] **Step 2 : Statuts.** Plan maître : ligne R4 → **« En cours (4a, 4b, 4c réalisés ; 4d à venir) »** ; fusionner les deux « Suivi tracé, à traiter en 4c » (doublon relevé par la revue de R4b) en un seul « Suivi tracé, à traiter en 4d ou R9 » qui ne garde que ce qui reste : retirer `isWithinClientScope`/`isWithinTeamScope`/`chauffeurWithoutTeamError`/`TEAM_SCOPE_ERROR`/`extractId` de `comptes/http/acteur.ts` quand la route `rapport` (4d) ne les utilisera plus — attention, `clients-sites` utilise `isWithinClientScope` ; supprimer alors la matrice de parité de `domain/visibilite.test.ts`. Spec : ligne de statut → « R4 en cours (4a, 4b, 4c réalisés) ». Ajouter une section « Enseignements de R4c » avec, au minimum : (1) la révision `__v` fait partie de la réponse — un `save()` qui touche un tableau l'incrémente, d'où des écritures « charger, modifier, enregistrer » dans le dépôt plutôt qu'un `updateOne` ; seul le filet exécuté l'a montré ; (2) les contrôles de forme d'une photo précèdent la lecture de l'opération (400/413 avant 404) et l'équipe précède la transition et les plafonds ; (3) le changement de statut peut remplacer les photos **sans** plafond de poids ni de nombre — comportement d'origine conservé, à traiter par un correctif fonctionnel distinct ; (4) tout ce que l'exécution a réellement appris et que ce plan n'avait pas prévu.

- [ ] **Step 3 : Non-régression ciblée** (à consigner dans le rapport) : `git diff main --stat -- tests/unit tests/integration` → un seul fichier (créé en tâche 1) ; `wc -l "src/app/api/operations/[id]/statut/route.ts" "src/app/api/operations/[id]/photos/route.ts"` → 1 ligne chacun ; `git diff main --stat -- "src/app/api/operations/[id]/rapport/route.ts"` → vide ; `grep -rn "isWithinTeamScope\|TEAM_SCOPE_ERROR" src/app` → uniquement la route `rapport`.

- [ ] **Step 4 : Commit**

```bash
git add README.md docs/superpowers
git commit -m "docs: statuts du sous-jalon R4c (operations : statut, données de terrain, photos)"
```

- [ ] **Step 5 : Revue du sous-jalon** — **effectuée par le contrôleur** (revue finale de branche complète, modèle le plus capable ; ne pas la dispatcher comme tâche). Critères : chaque gestionnaire migré comparé ligne à ligne à sa version de `main` (`git show "main:src/app/api/operations/[id]/statut/route.ts"`, `git show "main:src/app/api/operations/[id]/photos/route.ts"`) — mêmes gardes, même ordre, mêmes conditions d'application des champs (`!== undefined` contre véracité), mêmes messages ; aucun `connectDB()` perdu ; `domain/` et `application/` sans `mongoose`, `next` ni `platform` ; la route `rapport` intacte ; `package.json` absent de tous les commits.

---

## Auto-relecture

- **Couverture de la spec (R4c = « statut/terrain/photos ») :** transitions de statut appliquées par le cas d'usage (tâche 4) ; historique et champs de terrain (tâches 3-4) ; plafonds de photos 2 Mo / 8 Mo / 10 en règles pures (tâche 2) ; ajouter/retirer une photo (tâches 3-5) ; visibilité par équipe via `peutAgirSurOperation` sur `Acteur` (tâche 4) ; `Horloge` (tâche 4) ; règle métier n°4 « Terminée sans En cours » (tâches 2 et 4). Défense en profondeur du périmètre (constat R4b) : tâche 4. **Reste pour 4d, volontairement :** rapport PDF (`GenerateurRapportPdf`), puis retrait des gardes héritées de `comptes/http/acteur.ts`.
- **Cohérence des noms :** `EtatTerrain`, `DonneesTerrain`, `DemandeChangementStatut`, `ChangementStatut`, `terminaisonSansEnCours`, `messageAlerteCoherence` (tâche 2 → 3, 4, 5) ; `octetsStockes`, `validerNouvellePhoto`, `verifierCapacite`, `MAX_PHOTO_OCTETS`, `MAX_PHOTOS_OCTETS_CUMULES`, `MAX_PHOTOS` (tâche 2 → 4) ; `OperationRepository.{trouverEtatTerrain,changerStatut,ajouterPhoto,retirerPhotos}` (port, adaptateur, faux, cas d'usage) ; `AlerteCoherence` (port, cas d'usage, composition) ; `creerCasDUsageTerrain` / `casDUsageTerrain.{verifierAccesTerrain,changerStatut,ajouterPhoto,retirerPhoto}` (tâche 4, contrôleurs) ; `compteClientSansPerimetre`, `CompteClientSansPerimetre` (tâche 2 pour l'erreur, tâche 4 pour la règle et son usage) ; `versDemandeStatut`, `StatusUpdateInput` (tâche 5).
- **Décomptes de tests attendus :** 1121 → 1138 (tâche 1, +17) → 1163 (tâche 2, +17 +8) → 1175 (tâche 3, +12) → 1204 (tâche 4, +26 +2 +1) → 1217 (tâche 5, +13). Un écart de quelques unités vient d'un `it.each` mal compté par ce plan : à noter dans le rapport, pas à « corriger » en retirant des tests.
- **Points de vigilance :** (1) les trois écritures du dépôt passent par `findById` + `save()`, jamais par `updateOne`/`findByIdAndUpdate` : `__v` en dépend ; (2) `uniteQuantite` est appliquée sur un test de **véracité**, les cinq autres champs sur `!== undefined` — ne pas uniformiser ; (3) `versDemandeStatut` ne recopie pas champ par champ (une clé absente doit rester absente) ; (4) dans les trois contrôleurs, `verifierAccesTerrain` est appelé **avant** `guardObjectId`, et `req.json()` **après** ; (5) `body.photo`, `body.nom`, `body.url` sont lus dans le contrôleur : un corps JSON `null` lève une exception comme aujourd'hui ; (6) `alerteCoherence` est une fonction qui appelle `console.warn`, pas un alias — le filet l'espionne ; (7) aucune garde n'est retirée de `comptes/http/acteur.ts` (la route `rapport` les utilise encore) ; (8) le remplacement des photos par le `PATCH` reste sans plafond : ne pas en ajouter ici ; (9) `package.json` et `skills-lock.json` ne sont jamais indexés.
