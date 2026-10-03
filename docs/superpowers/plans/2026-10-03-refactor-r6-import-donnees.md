# Refactoring R6 — Domaine `import-donnees` : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrer l'import Excel (aperçu et import des collectes passées) vers l'architecture hexagonale. `src/app/api/import/route.ts` devient un ré-export ; `src/lib/excel-import.ts` disparaît.

**Architecture:** `src/backend/import-donnees/` : `domain/{lecture,import,erreurs,ports}.ts` (interprétation des dates et des quantités, détection des en-têtes, résumé, historique reconstitué), `application/cas-d-usage.ts` (`analyser`, `importer`), `infrastructure/excel/lecteur-excel.exceljs.ts` (parcours du classeur avec ExcelJS), `http/import.controleur.ts`, `composition.ts`, `index.ts`. Les sites et les opérations sont créés par l'API publique de `clients-sites` et d'`operations`, qui reçoivent des capacités ciblées.

**Tech Stack:** Next.js 16, TypeScript, ExcelJS, Mongoose 8, Vitest + mongodb-memory-server.

**Spec / feuille de route:** `docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md` (§6 ligne `import-donnees` : « normalisation des noms de sites, quantités nulles rejetées, dates françaises | analyser, importer | `LecteurExcel` ; dépôts via `operations/index.ts` et `clients-sites/index.ts` » ; §7 : `lib/excel-import.ts` → `backend/import-donnees/{domain,infrastructure/excel}`) ; `docs/superpowers/plans/2026-09-20-refactor-architecture-master.md`.

## Global Constraints

- **Aucun changement de comportement** : mêmes codes (200, 400, 403, 404, 413, 422), mêmes corps, mêmes messages, même ordre des vérifications (type MIME et taille du fichier multipart → fichier requis → extension → taille → analyse → 422 → aperçu → client requis → identifiant → client introuvable → import), mêmes documents créés (site importé, opération « Rapportée » avec son historique reconstitué de six entrées).
- Tests existants : chemins d'import seulement. À chaque commit : `npx tsc --noEmit`, `npm run lint` (0 erreur), `npx vitest run` verts (**1322 tests / 100 fichiers au départ**, `main` `e28209a`).
- `domain/` et `application/` n'importent ni `exceljs`, ni `mongoose`, ni `next`, ni `platform` ; un autre domaine uniquement par son `index.ts`.
- Ne jamais lire `.env.local` ; ne jamais lancer `npm run build`/`seed`. Ne jamais stager `.agents/`, `.claude/`, `skills-lock.json`, `rapports/`, `data/`, `package.json`.
- Branche `refactor/r6-import-donnees` (déjà créée depuis `main`). Fusion locale après revue ; aucun push sans accord.

### Faits vérifiés

Épinglés par `tests/integration/import-caracterisation.test.ts` (13 tests, **déjà écrit et vert sur `main`**), en plus de `tests/unit/excel-import.test.ts` (dates I4, quantités I5) et `tests/integration/phase2-import-photos.test.ts` (garde-fous I1, I2, I3, I5). Particularités conservées : la détection des en-têtes est très tolérante (un en-tête d'une seule lettre contenue dans un libellé connu est reconnu) ; l'aperçu ne vérifie pas le client ; le doublon se juge sur (site, date à 08:00 heure locale, quantité) ; un site existant est retrouvé sans tenir compte de la casse, dans le seul périmètre du client ; l'historique importé n'a pas d'auteur.

## Review Focus

1. **Date française** (`05/06/2026` = 5 juin) et quantité nulle ou absente (ligne ignorée et signalée) — tâche 2 (règles pures) et tests existants.
2. **Site homonyme d'un autre client** : jamais réutilisé — tâche 3 (contrat) et filet.
3. **Nom de site avec caractères spéciaux** (`dépôt (a+b).`) : recherché littéralement — tâche 3 et filet.
4. **Ré-import du même fichier** : aucune création, tout en doublon — tâche 4 et filet.
5. **Client inconnu ou identifiant invalide** : rien n'est créé — tâche 5 et filet.

---

### Task 1 : Filet
- [ ] 13 PASS sur le code actuel ; commit `test(import-donnees): caractérisation des formes exactes de l'aperçu et de l'import`.

### Task 2 : Règles pures et lecteur Excel
- [ ] `domain/lecture.ts` (+ test écrit d'abord) : types `LigneImportee`, `LectureClasseur` ; `interpreterDate`, `interpreterQuantite`, `correspondAUnEntete`, listes d'en-têtes. `git mv src/lib/excel-import.ts src/backend/import-donnees/infrastructure/excel/lecteur-excel.exceljs.ts` : le parcours du classeur reste tel quel et appelle les règles pures ; `parseExcelFile` garde son nom (le test unitaire existant ne change que d'import) ; classe `LecteurExcelJs`.
- [ ] `domain/import.ts` (+ test) : `normaliserNomSite`, `resumerLecture`, `dateHeurePrevueImportee`, `historiqueImporte`, constantes ; `domain/erreurs.ts` ; `domain/ports.ts`. Ajouter `import-donnees` à `domainesBackendMigres`. Commit.

### Task 3 : Capacités publiques de `clients-sites` et d'`operations`
- [ ] `clients-sites/index.ts` : `identifiantDuClient`, `trouverSiteDuClientParNom`, `creerSite` (+ tests d'assemblage). `operations` : `OperationRepository.{existeCollecte,creerRealisee}` (+ contrat, + faux), exposés par `index.ts` (`existeOperationCollectee`, `enregistrerOperationRealisee`). Commit.

### Task 4 : Cas d'usage
- [ ] `application/cas-d-usage.ts` (+ test écrit d'abord, avec faux) : `analyser`, `importer`. Composition. Commit.

### Task 5 : Contrôleur, route ré-exportée
- [ ] `http/import.controleur.ts` (analyse de la requête reprise à l'identique) ; route réduite à un ré-export ; oracle : `tests/integration/{import-caracterisation,phase2-import-photos,authz-roles}.test.ts` et `tests/unit/excel-import.test.ts` verts sans modification d'assertion ; `tsc`, lint, suite, `verifier-build`. Commit.

### Task 6 : Documentation, statuts et revue
- [ ] README, plan maître (R6 → **« Réalisé »**, « Enseignements de R6 »), spec. Commit `docs: statuts du jalon R6 (import-donnees) — R6 réalisé`.

## Auto-relecture

- **Couverture de la spec :** dates françaises, quantités nulles, normalisation des noms de sites (tâche 2) ; analyser, importer (tâche 4) ; `LecteurExcel` (tâche 2) ; dépôts par les `index.ts` (tâche 3).
- **Points de vigilance :** (1) les dates restent en heure locale ; (2) la tolérance de la détection d'en-têtes est conservée telle quelle ; (3) `importer` cherche chaque site une fois par nom unique du fichier (cache sur le nom normalisé) ; (4) l'aperçu ne touche pas la base ; (5) ni `clients-sites` ni `operations` ne dépendent d'`import-donnees` : imports statiques sans boucle.
