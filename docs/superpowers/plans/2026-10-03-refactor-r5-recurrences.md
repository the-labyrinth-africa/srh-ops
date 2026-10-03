# Refactoring R5 — Domaine `recurrences` : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrer le domaine `recurrences` (configuration des collectes récurrentes et génération des opérations) vers l'architecture hexagonale. Les trois fichiers `src/app/api/recurrences/**/route.ts` deviennent des ré-exports ; `src/models/` et `src/lib/validators/recurrence.ts` disparaissent.

**Architecture:** `src/backend/recurrences/` : `domain/{recurrence,occurrences,erreurs,ports}.ts`, `application/{cas-d-usage,generer-occurrences}.ts`, `infrastructure/{mongoose,en-memoire}/`, `http/`, `composition.ts`, `index.ts`. Le calcul des occurrences (ancre non dérivante, balayage calendaire, horizon) devient une règle pure à horloge injectée. La création des opérations passe par l'API publique d'`operations` (`operations/index.ts`), qui reçoit deux capacités ciblées : savoir si un créneau est déjà occupé pour un site, et créer une opération planifiée sans contrôle bloquant de conflit.

**Tech Stack:** Next.js 16, TypeScript, Mongoose 8, Zod, Vitest + mongodb-memory-server.

**Spec / feuille de route:** `docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md` (§6 ligne `recurrences` : « prochaine échéance (ancre non dérivante, décalage horaire) | CRUD, générer sans doublon avec conflit | `RecurrenceRepository` ; création d'opération via `operations/index.ts` ») ; `docs/superpowers/plans/2026-09-20-refactor-architecture-master.md`.

## Global Constraints

- **Aucun changement de comportement** : mêmes codes, mêmes corps JSON, mêmes messages (« Récurrence non trouvée », « Récurrence supprimée avec succès », « N opération(s) récurrente(s) générée(s) avec succès. », « Accès refusé », « Permission insuffisante »), même ordre des vérifications, mêmes exceptions non interceptées (filtre d'identifiant illisible, corps `null` de la génération).
- Écarts connus et acceptés (plan maître) : ordre des clés JSON ; valeurs par défaut du schéma pour un champ absent ou `null` en base ; champ stocké hors schéma non renvoyé.
- Tests existants : chemins d'import seulement. À chaque commit : `npx tsc --noEmit`, `npm run lint` (0 erreur), `npx vitest run` verts (**1250 tests / 95 fichiers au départ**, `main` `d67c396`).
- `domain/` n'importe que `@/shared/**` et lui-même ; `application/` que `domain/` et `shared/` ; un autre domaine uniquement par son `index.ts` ; `http/` n'atteint `infrastructure/` que par `composition.ts`.
- Chaque méthode de dépôt appelle `connectDB()`.
- Ne jamais lire `.env.local` ; ne jamais lancer `npm run build`/`seed`. Ne jamais stager `.agents/`, `.claude/`, `skills-lock.json`, `rapports/`, `package.json`.
- Branche `refactor/r5-recurrences` (déjà créée depuis `main`). Fusion locale après revue ; aucun push sans accord.

### Faits vérifiés sur le code actuel

Épinglés par `tests/integration/recurrences-caracterisation.test.ts` (20 tests, **déjà écrit et vert sur `main`**) :

| Route | Ordre des vérifications | Comportement |
|---|---|---|
| `GET /api/recurrences` | `requireInternalAuth()` (403 « Accès refusé » pour `chauffeur` et `client`) | Filtres `clientId`, `siteId`, `frequence` transmis bruts (véracité) ; `active` présent et véridique → filtre sur `=== "true"` ; tri `createdAt` décroissant ; `{ items }` |
| `POST /api/recurrences` | `requireInternalAuth(true)` → `req.json()` → Zod (400) | Création puis relecture peuplée, 201 |
| `GET /api/recurrences/[id]` | auth → identifiant (400) → lecture | 404 « Récurrence non trouvée » |
| `PUT /api/recurrences/[id]` | auth écriture → identifiant (400) → `req.json()` → Zod (400) → `findByIdAndUpdate` | Les clés à défaut Zod omises sont réécrites (`heurePrevue`, `dureeEstimeeMinutes`, `equipementIds`, `informationsParticulieres`, **`active: true`**) ; les autres clés omises sont conservées ; 404 |
| `DELETE /api/recurrences/[id]` | auth écriture → identifiant (400) | `{ message: "Récurrence supprimée avec succès" }` ; 404 |
| `POST /api/recurrences/generate` | `requireInternalAuth(true)` → `req.json()` (illisible → `{}`) | `horizonDays = Math.min(90, Math.max(1, body.horizonDays \|\| 30))` (non numérique → `NaN`, renvoyé `null`, rien n'est généré) ; pour chaque récurrence **active** : occurrences entre maintenant et maintenant + horizon ; opération déjà présente pour (client, site, date) → ignorée ; conflit d'affectation → opération créée **sans** équipe ni véhicule et conflit signalé (`messages` joints par « ; ») ; statut `Affectée` si équipe et véhicule, sinon `Planifiée` ; historique `[{ statut, date: maintenant, parUtilisateur }]` ; `derniereGeneration` = date de la dernière occurrence **créée** (inchangée si aucune) ; `{ message, generatedCount, horizonDays, conflits }` |

Peuplement (toutes les réponses CRUD) : `clientId` → `nom` ; `siteId` → `nom adresse` ; `equipeId` → `nom` ; `vehiculeId` → `identification` ; `equipementIds` → `nom`. Relation supprimée → `null` ; équipement supprimé retiré.

Occurrences (heure **locale** du serveur, comme aujourd'hui) : `hebdomadaire`/`mensuelle` par balayage jour par jour depuis aujourd'hui 00:00 (jour de semaine ou jour du mois égal, heure prévue, occurrence ≥ maintenant) ; `personnalisee` par ancre (`derniereGeneration`, à défaut `createdAt`) + k × `intervalleJours` (défaut 7), en partant du premier rang possiblement dû, borne de 1000 rangs.

## Review Focus

1. **Occurrence déjà générée** (relance le même jour) : aucune opération en double, ancre inchangée — tâche 4 et filet.
2. **Ressource déjà prise** : l'opération est créée sans équipe ni véhicule et le conflit est signalé, jamais d'échec de la génération — tâche 4 et filet.
3. **Récurrence personnalisée dormante depuis longtemps** : reprise sans épuiser la borne de 1000 rangs, sans glissement de l'ancre — tâche 2 (règle pure) et tests existants (I6).
4. **`PUT` sans le champ `active`** : la récurrence est réactivée (comportement d'origine) ; équipe et véhicule omis conservés — tâche 3 (contrat du dépôt) et filet.
5. **Horizon non numérique ou hors bornes** : mêmes valeurs renvoyées, rien ne plante — tâche 5 (contrôleur) et filet.

---

### Task 1 : Filet
- [ ] `npx vitest run tests/integration/recurrences-caracterisation.test.ts` → 20 PASS ; commit `test(recurrences): caractérisation des formes exactes du CRUD et de la génération`.

### Task 2 : Déplacements et règles pures
- [ ] `git mv src/models/Recurrence.ts src/backend/recurrences/infrastructure/mongoose/recurrence.model.ts` ; `git mv src/lib/validators/recurrence.ts src/backend/recurrences/http/recurrence.schema.ts` ; codemods des imports (`@/models/Recurrence`, `@/lib/validators/recurrence`) ; `src/models/` disparaît.
- [ ] `domain/recurrence.ts` (entité, saisie, filtre, `RecurrencePlanifiable`), `domain/erreurs.ts` (`RecurrenceIntrouvable`), `domain/occurrences.ts` (+ test, écrit d'abord) : `horizonEnJours(valeur)`, `finHorizon(maintenant, jours)`, `heureEtMinutes(heurePrevue)`, `occurrencesDe(recurrence, maintenant, fin)` — transposition ligne pour ligne de `customOccurrences`/`calendarOccurrences`.
- [ ] Ajouter `recurrences` à `domainesBackendMigres` (test d'architecture). Commit `refactor(recurrences): modèle et schéma déplacés ; calcul des occurrences en règle pure`.

### Task 3 : Ports, dépôt Mongoose, faux en mémoire
- [ ] `domain/ports.ts` : `RecurrenceRepository { lister, trouverParId, creer, modifier, supprimer, listerActives, avancerAncre }`, `OperationsRecurrentes { existeSurCreneau, verifierConflits, creer }`, `Horloge`.
- [ ] Test de contrat du dépôt (écrit d'abord), puis `infrastructure/mongoose/recurrence.repository.mongoose.ts` ; `infrastructure/en-memoire/recurrence.repository.en-memoire.ts`. Commit `refactor(recurrences): entité, ports et adaptateur Mongoose`.

### Task 4 : Capacités publiques d'`operations` et cas d'usage
- [ ] `operations` : `OperationRepository.existeSurCreneau(clientId, siteId, date)` (+ contrat, + faux) ; cas d'usage `existeSurCreneau` et `creerPlanifiee(parUtilisateur, occurrence)` (statut initial, historique, valeurs de terrain par défaut ; pas de contrôle bloquant de conflit) (+ tests) ; `operations/index.ts` exporte `existeOperationSurCreneau`, `creerOperationPlanifiee`, le type `OccurrencePlanifiee`.
- [ ] `recurrences/application/cas-d-usage.ts` (CRUD) et `generer-occurrences.ts` (+ tests écrits d'abord, avec faux). Composition. Commit `refactor(recurrences): cas d'usage CRUD et génération par l'API publique d'operations`.

### Task 5 : Contrôleurs, routes ré-exportées
- [ ] `http/{presentation,liste.controleur,detail.controleur,generation.controleur}.ts` ; trois routes réduites à des ré-exports ; oracle : `tests/integration/{recurrences-caracterisation,recurrences-api,authz-roles,chauffeur-scope}.test.ts` verts sans modification d'assertion ; `tsc`, lint, suite, `verifier-build`. Commit `refactor(recurrences): contrôleurs ; trois routes réduites à des ré-exports`.

### Task 6 : Documentation, statuts et revue
- [ ] README (« État de la migration »), plan maître (ligne R5 → **« Réalisé »**, « Enseignements de R5 »), spec (statut). Non-régression ciblée. Commit `docs: statuts du jalon R5 (recurrences) — R5 réalisé`. Revue finale de branche.

## Auto-relecture

- **Couverture de la spec :** prochaine échéance en règle pure (tâche 2) ; CRUD (tâches 3-5) ; « générer sans doublon avec conflit » (tâche 4) ; `RecurrenceRepository` (tâche 3) ; création d'opération via `operations/index.ts` (tâche 4).
- **Points de vigilance :** (1) le calcul des occurrences reste en heure locale (`setHours`, `getDay`, `getDate`) : ne pas le « corriger » en UTC ; (2) `PUT` : la saisie est transmise telle quelle (clé absente = conservée) ; (3) l'ancre n'avance que si une occurrence a été créée ; (4) la génération ne lève jamais `ConflitAffectation` ; (5) `recurrences` n'importe `operations` que par son `index.ts` ; (6) l'opération générée garde les valeurs par défaut du schéma (`uniteQuantite: "Litres"`, chaînes vides) — fournies par `operations`, pas par `recurrences`.
