# Refactoring R7 — Domaine `pilotage` (statistiques) : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrer les statistiques du tableau de bord (`GET /api/dashboard/stats` et la page d'accueil de la direction) vers l'architecture hexagonale. Dernier domaine backend : à son issue, plus aucune route ni page n'importe un modèle Mongoose.

**Architecture:** `src/backend/pilotage/` : `domain/{statistiques,ports}.ts` (compteurs par statut effectif, opérations en retard, bornes du jour), `application/cas-d-usage.ts`, `infrastructure/mongoose/statistiques.query.mongoose.ts` (modèle de lecture : interroge les collections par le nom des modèles enregistrés, sans importer les modèles des autres domaines — c'est la « `StatistiquesQuery` (agrégation Mongo) » de la spec), `http/statistiques.controleur.ts`, `composition.ts`, `index.ts` (données de la page d'accueil). La règle du statut effectif, utilisée par `operations`, `pilotage` et la page, passe dans `src/shared/operations/statut-effectif.ts`.

**Tech Stack:** Next.js 16, TypeScript, Mongoose 8, Vitest + mongodb-memory-server.

**Spec / feuille de route:** `docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md` (§6 ligne `pilotage` : « statut effectif (retard), regroupements | statistiques | `StatistiquesQuery` (agrégation Mongo) ») ; `docs/superpowers/plans/2026-09-20-refactor-architecture-master.md`.

## Global Constraints

- **Aucun changement de comportement** : même réponse `{ stats, todayOps, delayedOps }` (les opérations du jour restent les documents complets, client, site et équipe peuplés par leur nom, tri par heure croissante ; les opérations en retard restent les cinq premières dans l'ordre de la base), mêmes gardes (`requireInternalAuth()`), même page d'accueil.
- Optimisation sans effet observable, assumée : les compteurs ne chargent plus que les quatre champs utiles de chaque opération (l'origine chargeait les documents entiers, photos comprises).
- Tests existants : chemins d'import seulement. À chaque commit : `npx tsc --noEmit`, `npm run lint` (0 erreur), `npx vitest run` verts (**1366 tests / 104 fichiers au départ**, `main` `8e4e098`).
- `domain/` n'importe que `@/shared/**` et lui-même ; aucun import d'un modèle d'un autre domaine.
- Branche `refactor/r7-pilotage` (déjà créée depuis `main`). Fusion locale après revue ; aucun push sans accord.

### Faits vérifiés

Épinglés par `tests/integration/pilotage-caracterisation.test.ts` (6 tests, **déjà écrit et vert sur `main`**) : compteurs `prevues` (Planifiée, Affectée), `enCours` (En route, En cours), `terminees` (Terminée, Rapportée), `retardees`, `annulees` sur le statut **effectif** ; `totalClients`, `totalSites` ; opérations du jour entre 00:00:00.000 et 23:59:59.999 heure locale ; relation supprimée → `null`.

## Review Focus

1. **Opération dépassée non terminée** : comptée en retard et listée ; terminée ou annulée : jamais en retard — tâche 2 (règle pure) et filet.
2. **Base vide** : compteurs à zéro, listes vides — filet.
3. **Limites de la journée** (hier 23:59:59.999, demain 00:00) : exclues — tâche 2 et filet.
4. **Relation supprimée sur une opération du jour** : `null`, pas d'exception, la page affiche un nom vide — filet.
5. **Plus de cinq opérations en retard** : cinq renvoyées, dans l'ordre de la base — tâche 2 et filet.

---

### Task 1 : Filet
- [ ] 6 PASS sur le code actuel ; commit `test(pilotage): caractérisation des statistiques du tableau de bord`.

### Task 2 : Statut effectif partagé, règles pures, ports
- [ ] `git mv` de `operations/domain/statut-effectif{,.test}.ts` vers `src/shared/operations/` ; `operations/index.ts` continue de l'exporter. `pilotage/domain/statistiques.ts` (+ test écrit d'abord) : `compterParStatut`, `operationsEnRetard`, `bornesDuJour` ; `domain/ports.ts` (`StatistiquesQuery`, `Horloge`). Ajouter `pilotage` à `domainesBackendMigres`. Commit.

### Task 3 : Modèle de lecture, cas d'usage, contrôleur, page
- [ ] `infrastructure/mongoose/statistiques.query.mongoose.ts` (+ test de contrat écrit d'abord) ; `application/cas-d-usage.ts` (+ test avec faux) ; `composition.ts`, `index.ts` ; `http/statistiques.controleur.ts` ; route réduite à un ré-export ; `src/app/(dashboard)/page.tsx` lit ses données par `@/backend/pilotage` (plus aucun import de modèle). Oracle : `tests/integration/{pilotage-caracterisation,dashboard-planning,authz-roles,chauffeur-scope}.test.ts` et `tests/unit/page-guards.test.ts` verts sans modification d'assertion ; `verifier-build`. Commit.

### Task 4 : Documentation, statuts et revue
- [ ] README, plan maître (R7 → **« Réalisé »**, « Enseignements de R7 »), spec. Commit `docs: statuts du jalon R7 (pilotage) — R7 réalisé`.

## Auto-relecture

- **Couverture de la spec :** statut effectif et regroupements en règles pures (tâche 2) ; cas d'usage « statistiques » (tâche 3) ; `StatistiquesQuery` (tâche 3).
- **Points de vigilance :** (1) le modèle de lecture récupère les modèles par leur nom **après** `connectDB()` (qui les enregistre) ; (2) les opérations du jour restent des documents bruts : aucune conversion en entité, donc aucun écart de forme ; (3) les bornes du jour sont en heure locale ; (4) la page garde sa garde d'accès `requirePageAccess("/")` en première instruction.
