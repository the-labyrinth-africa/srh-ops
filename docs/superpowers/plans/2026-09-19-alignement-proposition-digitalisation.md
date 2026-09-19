# Alignement SRH Ops ↔ Proposition « Digitalisation des opérations » — Plan de mise en œuvre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ramener le dépôt à l'état réellement livré (Phases 1 et 2), puis combler l'écart avec la proposition PDF (Phases 3 à 6) dans l'ordre recommandé par le document.

**Architecture:** Next.js App Router + Mongoose + NextAuth (existant). Chaque phase ajoute des collections/routes/pages sans casser le socle. Ce document est une **feuille de route maîtresse** : seul le Lot 0 (récupération et stabilisation) est détaillé pas à pas ; chaque phase suivante doit recevoir son propre plan détaillé avant exécution (règle « un plan par sous-système »).

**Tech Stack:** Next.js 16, React 19, TypeScript, MongoDB/Mongoose, NextAuth v4, Zod, TanStack Query, FullCalendar, Vitest + mongodb-memory-server. Récupéré dans `7995783` : exceljs, jspdf, sharp, PWA (sw.js + outbox).

**Spec:** `docs/proposition-digitalisation.pdf`, `AGENTS.md`, `PLAN.md`, `DESIGN.md`, maquettes `sketch/`.

## Global Constraints

- Langue de l'interface et des libellés : français. Statuts exacts : `Planifiée → Affectée → En route → En cours → Terminée → Rapportée` (+ `Retardée`, `Annulée`).
- Déploiement progressif et modulaire (PDF §16) : chaque phase livrable et testable seule.
- Rôles : admin / dispatcher / lecture (main) ; chauffeur / client ajoutés par le commit récupéré.
- Aucune donnée réelle ni identifiant de base de données dans Git. `.env.local` reste ignoré.
- `npm run build` exécute `npm run seed` : ne jamais le lancer avec le `MONGODB_URI` de production sans le vouloir (voir Lot 0, tâche 4).
- Nom du client : **SRH** (confirmé). Le nom d'entreprise fictif figurant dans le PDF de proposition n'est pas le nom du client : ne jamais l'afficher dans l'application, les e-mails ou les PDF.
- Une quantité collectée de 0 n'est pas une collecte valide : l'import et les validateurs la rejettent.

---

## 1. Constat : ce qui a été fait

### 1.1 État du dépôt (constaté le 2026-09-19)

| Élément | Constat |
|---|---|
| Branche `main` | `99dacb5`, alignée sur `origin/main`. Contient les Sprints S0–S5 (Phase 1). |
| Travail perdu | Le commit **`7995783` « Phase 2 : PWA hors-ligne + outbox FIFO + tests verts »** (17/09, +7 858 lignes, 81 fichiers) n'appartient plus à aucune branche : un `git reset` vers `origin/main` l'a détaché. Il n'est accessible que par le reflog et sera supprimé par le ramasse-miettes de Git. **Une branche de sauvegarde `recovery/phase2-pwa-7995783` a été créée pendant cette analyse.** |
| Branche `sauvegarde-pre-reset-171933` | Pointe sur `99dacb5` : elle ne sauvegarde **rien** du commit perdu. |
| `rapports/Rapport_Avancement_Projet.pdf` (non suivi) | Décrit l'état de `7995783` (récurrences, PDF, photos, signature, /terrain, rôles chauffeur/client, e-mail, 62 tests). **Il ne correspond pas au code de `main`.** |
| Modifs non commitées | `package.json` (next 15 → 16.3.5), `tsconfig.json` (auto-généré par Next 16), `package-lock.json`. |
| Fichiers non suivis | `DIGITALISATIONDESOPERATIONS.pdf`, `RECAP JUIN 2026.xlsx` (données réelles), `rapports/`. |

### 1.2 Vérifications exécutées sur `main`

- `npx tsc --noEmit` : OK.
- `npx vitest run` : 9 fichiers, **47/47** tests passent (le rapport annonce 62 ; `7995783` contient ~66 `it()`).
- `npm run lint` : **cassé** — `next lint` a été retiré de Next 16 (`Invalid project directory … /lint`). `eslint-config-next` est toujours en v15.
- `npm run build` : non exécuté (il lance le seed sur la base configurée).

### 1.3 Ce que contient `main` (Phase 1)

Modèles Client, Site, Equipe, Vehicule, Equipement, Operation (+ `historiqueStatuts`), User. API CRUD des 5 référentiels, opérations (filtres, pagination, conflits 409), changement de statut historisé avec matrice de transitions, planning, stats dashboard. UI : login, dashboard (KPI, opérations du jour, retards), liste/création/détail d'opération, calendrier FullCalendar, pages référentiels. 47 tests.

### 1.4 Ce que contient le commit perdu `7995783` (Phase 2 partielle)

Récurrences (modèle, génération sans doublon, UI), rapport PDF (jspdf), photos (base64), signature client (canvas), relevé de quantités/unités, console `/terrain`, rôles chauffeur/client, gestion des utilisateurs, import Excel (exceljs), mot de passe oublié / changement, `lib/email.ts`, manifest PWA, `sw.js`, outbox hors-ligne FIFO, icônes, 3 fichiers de tests supplémentaires.

Défauts repérés à la lecture (non exécutés) :

- `public/sw.js` : `if (url.pathname.startsWith("/api/")) return hardware;` — `hardware` n'est défini nulle part ; toute requête GET `/api/*` interceptée lèvera une `ReferenceError`. Doit être `return;`. Ligne voisine : `new URL(request.url    )` (espaces parasites).
- `rapports/1.tmp`, `2.tmp`, `3.tmp` (3 × 123 Ko) commités par erreur.
- Photos et signature stockées en base64 **dans le document Operation** : limite Mongo de 16 Mo par document (10 photos + signature) et gonflement des lectures de liste.
- Le rapport annonce « reste à faire : synchronisation hors-ligne », mais le nom du commit et `lib/offline/outbox.ts` + `hooks/useOfflineSync.ts` indiquent que l'outbox existe : l'avancement Phase 2 (75 %) est à re-mesurer.

### 1.5 Défauts propres à `main`

- `lib/conflicts.ts:40-41` : la fenêtre de recherche part de `start − 120 min` ; une opération plus longue que 2 h et commencée plus tôt n'est pas vue (faux négatif de conflit). Il faut chercher `dateHeurePrevue < end` puis filtrer par chevauchement réel, ou stocker `dateHeureFin`.
- `app/api/dashboard/stats/route.ts` : charge **toutes** les opérations en mémoire pour compter (`Operation.find().lean()`). À remplacer par des agrégations dès que le volume croît.
- `Retardée` est calculé à l'affichage seulement, jamais persisté ni notifié.
- `middleware.ts` : convention renommée `proxy` dans Next 16 (avertissement de dépréciation).
- Données de démo du seed (« TotalEnergies Raffinerie Normandie », Rouen, e-mail `total.fr`) sans rapport avec le terrain réel (Abidjan). README annonce Next 15 alors que `package.json` passe à 16.
- Mots de passe de seed (`admin123`, `dispatch123`) dans README et script : à changer en production.

---

## 2. Comparaison avec le PDF (article par article)

Légende : ✅ fait sur `main` · 🟡 partiel · 🔁 présent dans `7995783` (à récupérer) · ❌ absent partout.

| § PDF | Exigence | `main` | `7995783` | Écart restant |
|---|---|---|---|---|
| 3 | Créer/planifier une opération (client, site, nature, date, équipe, véhicule, équipements, infos, statut) | ✅ | — | Aucun |
| 3 | Statuts et vues prévues / en cours / terminées / retardées / annulées | ✅ | — | Indicateur « nécessitant une action » absent (couleur `status-action-req` définie dans DESIGN.md, non utilisée) |
| 4 | Collectes récurrentes hebdo / mensuelle / personnalisée + génération auto | ❌ | 🔁 | « Sur demande du client » non couvert ; génération lancée à la main, pas planifiée (cron) |
| 5 | Clients : coordonnées, sites, types de déchets, observations | ✅ | — | — |
| 5 | Clients : fréquence des collectes, historique des interventions, volumes collectés, documents associés | ❌ | 🟡 (quantités sur l'opération) | Page détail client avec historique, volumes cumulés, documents |
| 6 | Mobile : consulter, arrivée, démarrer, volumes, photos, observations, signature, clôturer | ❌ | 🔁 `/terrain` web | « Confirmer la prise en charge » et « indiquer l'arrivée » (horodatage/géoloc) à vérifier ; manifest/SW à corriger |
| 6 | Transmission automatique au central, hors-ligne | ❌ | 🔁 outbox FIFO | Test réel hors-ligne, résolution de conflits de synchronisation |
| 7 | Rapport d'intervention (client, site, date, équipe, véhicule, nature, quantités, observations, photos, signature, traçabilité) | ❌ | 🔁 PDF jspdf | Bloc « informations de traçabilité » (dépend Phase 3) ; archivage hors base ; **envoi au client par e-mail** |
| 8 | Flotte : identification, type, capacité, disponibilité | ✅ | — | — |
| 8 | Flotte : affectation, conducteur, kilométrage, historique d'usage, maintenance, contrôles/documents, alertes d'échéance | ❌ | ❌ | Module complet (modèles `Maintenance`, `DocumentVehicule`) |
| 9 | Équipements : disponibilité | ✅ | — | — |
| 9 | Équipements : état, maintenance, historique d'utilisation, affectation | ❌ | ❌ | Champs `etat`, journal de maintenance, historique dérivé des opérations |
| 10 | Demande de collecte en ligne (formulaire public) → validation → planification | ❌ | ❌ | Statut `Demande`, formulaire, file de validation |
| 11 | Espace client (demandes, prochaines collectes, historique, volumes, rapports, documents) | ❌ | 🟡 rôle `client` défini | Aucun écran ; filtrage strict par `clientId` |
| 12 | Traçabilité : site → collecte → véhicule → volume → réception → traitement → valorisation | ❌ | ❌ | Collection `Tracabilite`, identifiant de lot, étapes réception/traitement/valorisation |
| 13 | Dashboard direction : activité | 🟡 prévues, en cours, terminées, retardées, annulées | — | « Demandes en attente » |
| 13 | Dashboard : volumes (par client, par site, évolution) | ❌ | ❌ | Agrégations + graphiques |
| 13 | Dashboard : ressources (véhicules dispo/affectés, équipes dispo, interventions par équipe) | ❌ | ❌ | Agrégations |
| 13 | Dashboard : performance (taux de réalisation, retards, fréquence, évolution) | ❌ | ❌ | Agrégations + exports |
| 14 | Notifications : rappel, retard, nouvelle mission, confirmation, avancement client, échéances | ❌ | 🟡 `lib/email.ts` (reset mot de passe) | Moteur de notifications, SMS, cron |
| 15 | Optimisation des tournées | ❌ | ❌ | `localisation` des sites existe ; moteur à faire |
| 16 | Déploiement progressif | ✅ | — | Suivre l'ordre des phases ci-dessous |
| 18 | Cellule IT dédiée (maintenance, sécurité, accompagnement) | — | — | Non logiciel : cadrer par contrat / SLA |

### Avancement par phase du PDF (§16)

| Phase PDF | Contenu | Avancement réel (code) | Avancement annoncé par le rapport |
|---|---|---|---|
| 1 — Planification | Clients/sites, planning, équipes, véhicules, statuts | **100 % sur `main`** (moins les récurrences, présentes dans `7995783`) | 100 % |
| 2 — Terrain | Mobile, missions, photos, volumes, signature, rapport | **0 % sur `main`** ; ~70-80 % dans `7995783` | 75 % |
| 3 — Traçabilité | Historique, traçabilité, volumes, traitement/valorisation | 0 % | 0 % |
| 4 — Client | Espace client, demande en ligne, rapports, notifications | ~0 % (un rôle) | 5 % |
| 5 — Pilotage | Dashboard direction, KPI, alertes, rapports auto | ~25 % (KPI de statut) | 10 % |
| 6 — Optimisation | Tournées, automatisation, intégrations | ~3 % (`localisation`) | 5 % |

Conclusion : **le rapport d'avancement décrit un code qui n'est plus dans le dépôt**. Tant que `7995783` n'est pas réintégré, le chiffre « ~32 % » est faux pour `main` (≈ 17 %).

### Point d'attention sur les données réelles (`RECAP JUIN 2026.xlsx`)

29 lignes de collecte (11 → 23 juin 2026), colonnes `SITES / DATES / QTES`, total 14 140 (unité non précisée, probablement litres). Le parseur d'`exceljs` de `7995783` (`lib/excel-import.ts`) vise exactement ce format. Difficultés à traiter à l'import :

- **Pas de colonne client, unité, équipe ni véhicule** → l'import doit demander un client par défaut ou une table de correspondance site → client.
- **Fautes de saisie** : « 7e traznche 1 », « latrillme a » ; casse hétérogène (« PO abatta »).
- **Doublons** : « aero cite » figure le 19 et le 22 juin (quantité 0) ; « 7e tranche 1/2 », « latrille a/b » sont des sites distincts.
- **Quantités à 0** (aero cite ×2, apm, notre dame, avenue christiani) : non valides selon le client (« il n'y a pas de quantité 0 ») ; l'import les écarte et les signale dans l'aperçu.
- **Valeur atypique** : « ss moossou » 3 540 (25 % du total).
- **Sites hors Abidjan** (Bassam, Aboisso, Adiaké) : à distinguer pour l'optimisation de tournées.

---

## 3. Plan de mise en œuvre

Ordre recommandé : **Lot 0 → Phase 2 (finition) → Phase 3 → Phase 4 → Phase 5 → Phase 6.** Le Lot 0 est bloquant : rien d'autre ne doit être commencé tant que le travail perdu n'est pas réintégré.

### Vue d'ensemble

| Lot | Contenu | Dépend de | Durée indicative |
|---|---|---|---|
| **0** | Récupération, stabilisation de `main`, corrections connues | — | 2-3 jours |
| **1 = Phase 2** | Finition terrain : PWA, hors-ligne, rapport, envoi e-mail, stockage médias | Lot 0 | 1,5-2 sem. |
| **1.5** | Import des données réelles (juin 2026) + complétude Phase 1 (fiche client, flotte, équipements) | Lot 0 | 1-1,5 sem. |
| **2 = Phase 3** | Traçabilité des déchets | Lot 1 | 2-3 sem. |
| **3 = Phase 4** | Demandes en ligne + espace client + notifications de base | Lots 1, 2 | 3 sem. |
| **4 = Phase 5** | Dashboard direction, alertes, rapports automatisés | Lots 1.5, 2, 3 | 2 sem. |
| **5 = Phase 6** | Optimisation des tournées | Lots 2, 4 | 3-4 sem. |

Les lots 1 et 1.5 peuvent avancer en parallèle (fichiers disjoints, hors `Sidebar.tsx` et `types/index.ts` à fusionner avec soin).

---

### Lot 0 — Récupération et stabilisation (détaillé)

**Files:**
- Modify: `public/sw.js`, `package.json`, `.gitignore`, `README.md`, `PLAN.md`
- Delete (de l'index): `rapports/*.tmp`
- Create: `docs/superpowers/plans/` (ce fichier)
- Test: `tests/unit/conflicts.test.ts`, `tests/integration/*`

**Interfaces:**
- Produces: une branche `main` (ou `phase2`) contenant Phase 1 + Phase 2, `npm run lint` fonctionnel, tests verts.

#### Task 1 — Sécuriser le commit orphelin

- [ ] **Étape 1 : Vérifier que la branche de sauvegarde existe**

Run: `git branch --list 'recovery/*' && git log --oneline -1 recovery/phase2-pwa-7995783`
Expected: `7995783 Phase 2 : PWA hors-ligne + outbox FIFO + tests verts`

- [ ] **Étape 2 : (NE PAS EXÉCUTER — décision du contrôleur)** Le push de la sauvegarde vers `origin` est une action externe soumise à l'accord de l'utilisateur ; il sera demandé à la fin. Passer directement à la tâche suivante.

#### Task 2 — Isoler les changements locaux non commités

- [ ] **Étape 1 : Décider Next 15 ou Next 16.** Le lot recommande **Next 16** (déjà installé, `.next` construit avec). Mettre à jour `eslint-config-next` en ^16 et supprimer la dépendance obsolète.

Run: `npm install eslint-config-next@^16 --save-dev`

- [ ] **Étape 2 : Remplacer le script lint cassé** dans `package.json` :

```json
"lint": "eslint ."
```

- [ ] **Étape 3 : Vérifier**

Run: `npm run lint`
Expected: pas d'erreur de chemin ; corriger ou baseliner les alertes réelles.

- [ ] **Étape 4 : Commit** (la branche `chore/next16-stabilisation` est déjà créée et active ; ne pas en créer d'autre)

```bash
git add package.json package-lock.json tsconfig.json
git commit -m "chore: passage à Next 16 et script lint ESLint"
```

#### Task 3 — Réintégrer la Phase 2

- [ ] **Étape 1 : Cherry-pick du commit perdu**

Run: `git cherry-pick 7995783`
Expected: conflits probables dans `package.json`, `package-lock.json`, `middleware.ts`, `lib/auth.ts`. Résoudre en gardant `next@^16` et en conservant les dépendances ajoutées (`exceljs`, `jspdf`, `jspdf-autotable`, `sharp`, etc.). Régénérer le lockfile : `npm install`.

- [ ] **Étape 2 : Retirer les fichiers parasites**

```bash
git rm --cached rapports/1.tmp rapports/2.tmp rapports/3.tmp
printf '\nrapports/*.tmp\n' >> .gitignore
```

- [ ] **Étape 3 : Corriger le service worker** (`public/sw.js`)

Remplacer `if (url.pathname.startsWith("/api/")) return hardware;` par :

```js
if (url.pathname.startsWith("/api/")) return;
```

et `new URL(request.url    )` par `new URL(request.url)`.

- [ ] **Étape 4 : Vérifier tsc et tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 erreur TypeScript ; ~66 tests verts.

- [ ] **Étape 5 : Commit**

```bash
git add -A
git commit -m "feat: réintégration Phase 2 (PWA, rapport, récurrences, import) et correctifs sw.js"
```

#### Task 4 — Neutraliser le seed dans le build

Problème : `"build": "npm run seed && next build"` écrit dans la base à chaque build. Une garde sur `NODE_ENV` ne protège pas (il n'est pas `production` pendant l'étape `npm run seed` d'un build local ou Vercel). La garde repose donc sur un drapeau explicite : le script `build` passe `--on-build`, et ce mode ne seed que si `SEED_ON_BUILD=true`. `npm run seed` lancé à la main seed toujours.

**Files:**
- Modify: `scripts/seed-admin.ts`, `package.json` (script `build`), `README.md`
- Test: `tests/unit/seed-guard.test.ts`

**Interfaces:**
- Produces: `export function shouldSeed(env: Record<string, string | undefined>, argv: string[]): boolean` dans `scripts/seed-admin.ts`. Importer ce module ne doit rien exécuter (pas de connexion DB) : `seed()` n'est appelé que si le fichier est lancé directement (`require.main === module`, le projet est en CJS sous tsx — vérifier que cela fonctionne avec `npm run seed`).

- [ ] **Step 1: Écrire le test d'échec** dans `tests/unit/seed-guard.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { shouldSeed } from "../../scripts/seed-admin";

describe("shouldSeed", () => {
  it("seed toujours lors d'un lancement manuel (sans --on-build)", () => {
    expect(shouldSeed({}, [])).toBe(true);
  });
  it("ne seed pas pendant le build sans SEED_ON_BUILD=true", () => {
    expect(shouldSeed({}, ["--on-build"])).toBe(false);
    expect(shouldSeed({ SEED_ON_BUILD: "false" }, ["--on-build"])).toBe(false);
  });
  it("seed pendant le build si SEED_ON_BUILD=true", () => {
    expect(shouldSeed({ SEED_ON_BUILD: "true" }, ["--on-build"])).toBe(true);
  });
});
```

- [ ] **Step 2: Lancer** `npx vitest run tests/unit/seed-guard.test.ts` → FAIL (`shouldSeed` non exporté).

- [ ] **Step 3: Implémenter** dans `scripts/seed-admin.ts` :

```ts
export function shouldSeed(
  env: Record<string, string | undefined>,
  argv: string[]
): boolean {
  if (!argv.includes("--on-build")) return true;
  return env.SEED_ON_BUILD === "true";
}
```

En bas du fichier, remplacer l'appel inconditionnel de `seed()` par un appel gardé : seulement si le module est exécuté directement ET `shouldSeed(process.env, process.argv.slice(2))`, sinon afficher « Seed ignoré (build sans SEED_ON_BUILD=true) » et sortir avec le code 0. Puis dans `package.json` : `"build": "tsx scripts/seed-admin.ts --on-build && next build"`.

- [ ] **Step 4: Relancer** le test → PASS. Vérifier à la main, **sans base réelle** (`MONGODB_URI` pointant sur une URL inexistante ou vide), que `npx tsx scripts/seed-admin.ts --on-build` affiche le message d'ignorance et sort en 0 sans tenter de connexion. Documenter `SEED_ON_BUILD` dans `README.md` (section Déploiement : le seed automatique au build n'a plus lieu par défaut ; l'activer temporairement pour le premier déploiement).

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-admin.ts package.json tests/unit/seed-guard.test.ts README.md
git commit -m "fix: le build ne seed plus la base sans SEED_ON_BUILD"
```

#### Task 5 — Corriger la détection de conflits

- [ ] **Étape 1 : Test d'échec** (`tests/unit/conflicts.test.ts`) — une opération de 300 min démarrant à 08:00 doit entrer en conflit avec une nouvelle opération à 12:30 sur la même équipe (l'implémentation actuelle la manque car sa fenêtre commence 120 min avant).
- [ ] **Étape 2 : Lancer** — FAIL.
- [ ] **Étape 3 : Implémenter** — dans `lib/conflicts.ts`, filtrer `dateHeurePrevue: { $lt: end }` (sans borne basse) avec `statut: { $nin: [...] }` et `$or: [{equipeId}, {vehiculeId}]`, puis garder le test de chevauchement exact en mémoire.
- [ ] **Étape 4 : Lancer toute la suite** — PASS.
- [ ] **Étape 5 : Commit** — `git commit -am "fix: conflits détectés pour les opérations longues"`

#### Task 6 — Aligner la documentation et l'état d'avancement

- [ ] **Étape 1 :** `README.md` : Next 16, variable `SEED_ON_BUILD`, procédure PWA.
- [ ] **Étape 2 :** `PLAN.md` : ajouter S1.5 (récurrences) et Phase 2 ; remplacer les « 100 % » par les chiffres du tableau ci-dessus après re-mesure.
- [ ] **Étape 3 :** régénérer `rapports/Rapport_Avancement_Projet.pdf` (`scripts/generate-progress-report.ts`) une fois la Phase 2 réintégrée, en corrigeant les pourcentages (les chiffres actuels reposent sur du code absent de `main`).
- [ ] **Étape 4 :** déplacer `RECAP JUIN 2026.xlsx` (données client) dans `data/` et ajouter `data/` au `.gitignore` (ne pas le commiter) ; déplacer `DIGITALISATIONDESOPERATIONS.pdf` vers `docs/proposition-digitalisation.pdf` et le commiter.
- [ ] **Étape 5 :** commit sur `chore/next16-stabilisation`. **Ne pas** fusionner dans `main`, ne pas pousser, ne jamais utiliser `git reset` (la fusion est décidée par l'utilisateur en fin de lot).

**Critères d'acceptation Lot 0 :**
- [ ] `main` contient Phase 1 + Phase 2 ; `git branch --contains 7995783` liste au moins `main` et la branche de sauvegarde.
- [ ] `npx tsc --noEmit`, `npm run lint`, `npx vitest run` : tout vert.
- [ ] `npm run build` ne touche pas la base sans `SEED_ON_BUILD=true` (le build lui-même ne doit pas être lancé contre la base réelle pendant la vérification).
- [ ] `sw.js` ne lève plus d'exception sur les requêtes `/api/*`.
- [ ] Le rapport d'avancement correspond au code.

---

### Lot 1 — Phase 2 : finition terrain (à détailler dans `…-phase2-terrain.md`)

| # | Tâche | Fichiers principaux | Critère d'acceptation |
|---|---|---|---|
| 1.1 | Sortir photos et signature de la base : stockage objet (Vercel Blob privé ou équivalent), l'opération ne garde qu'une URL | `app/api/operations/[id]/photos/route.ts`, `components/ui/PhotoUpload.tsx`, `models/Operation.ts` | Document Operation < 50 Ko avec 10 photos ; migration des base64 existants |
| 1.2 | Actions terrain manquantes : « Prendre en charge », « Arrivé sur site » (horodatage + position optionnelle) | `components/terrain/TerrainViewClient.tsx`, `lib/status-transitions.ts`, `models/Operation.ts` (`priseEnChargeAt`, `arriveeAt`) | Chaque étape du §6 du PDF est un bouton et laisse une trace dans l'historique |
| 1.3 | PWA : installabilité (manifest, icônes, `display: standalone`), SW corrigé, page hors-ligne | `app/manifest.ts`, `public/sw.js`, `components/pwa/PwaRegistrar.tsx` | Audit Lighthouse PWA installable ; test manuel avion : `/terrain` s'ouvre |
| 1.4 | Outbox : tests de bout en bout hors-ligne (saisie hors-ligne → reconnexion → une seule écriture, idempotente) | `lib/offline/outbox.ts`, `hooks/useOfflineSync.ts`, `tests/unit/outbox.test.ts` | Clé d'idempotence par mutation ; rejeu FIFO ; erreur 4xx définitive sortie de la file |
| 1.5 | Rapport : ajouter les informations de traçabilité (emplacement prévu) et l'**envoi par e-mail au client** avec archivage | `app/api/operations/[id]/rapport/route.ts`, `lib/email.ts` | E-mail envoyé avec PDF joint ; date/heure d'envoi enregistrées |
| 1.6 | Récurrences : génération planifiée (cron Vercel) et option « sur demande du client » | `app/api/recurrences/generate/route.ts`, `vercel.ts` | Cron quotidien sans doublon ; test d'idempotence |

### Lot 1.5 — Import des données réelles et complétude Phase 1 (à détailler dans `…-donnees-reelles.md`)

| # | Tâche | Critère d'acceptation |
|---|---|---|
| 1.5.1 | Import de `RECAP JUIN 2026.xlsx` via `/import` avec **aperçu** : choix du client, unité (litres), normalisation des noms de sites (dédoublonnage, fautes), traitement des quantités à 0 | 29 lignes importées ou rejetées avec motif ; total contrôlé = 14 140 |
| 1.5.2 | Fiche client détaillée : historique des interventions, volumes cumulés, fréquence, documents | Page `/clients/[id]` avec onglets |
| 1.5.3 | Flotte : conducteur, kilométrage, maintenance, contrôles/documents, échéances | Champs et écrans ; liste « échéances à 30 jours » |
| 1.5.4 | Équipements : `etat`, maintenance, historique d'utilisation dérivé des opérations | Champs et écran |
| 1.5.5 | Indicateur « nécessite une action » (retard, sans équipe/véhicule à J-1, rapport manquant) | Badge + filtre sur la liste |
| 1.5.6 | Remplacer les données de démo du seed par un jeu représentatif (Abidjan) | Seed sans donnée « Normandie » |

### Lot 2 — Phase 3 : traçabilité (à détailler dans `…-phase3-tracabilite.md`)

- Modèle `Tracabilite` : `operationId`, `identifiantLot` (unique, lisible, ex. `TR-2026-000123`), `volumeCollecte`, `unite`, `vehiculeId`, `receptionAt`, `volumeRecu`, `ecart`, `traitement`, `valorisation`, historique d'étapes horodaté.
- Étapes : Site d'origine → Collecte → Véhicule → Volume → Réception → Traitement → Valorisation (PDF §12), avec transitions contrôlées comme pour les statuts.
- Création automatique du lot quand l'opération passe `Terminée` avec quantité.
- UI : chaîne de traçabilité par lot (maquettes `sketch/suivi_de_tra_abilit*`, `d_tail_cha_ne_de_tra_abilit`, `pilotage_valorisation`), recherche par identifiant, export CSV/PDF.
- Le rapport d'intervention affiche l'identifiant de lot.
- **Prérequis métier :** confirmer avec la direction les étapes réelles de réception/traitement/valorisation et les unités.

### Lot 3 — Phase 4 : expérience client (à détailler dans `…-phase4-client.md`)

- Statut `Demande` en amont de `Planifiée` ; transitions Demande → (Validée → Planifiée | Refusée).
- Formulaire public de demande (PDF §10 : identité, site, besoin, type de déchet, volume estimé, date souhaitée, infos) avec anti-spam (BotID ou captcha), limitation de débit, validation Zod.
- File de validation côté dispatcher (`sketch/demandes_de_collecte`, `validation_planification_de_demande`).
- Espace client (rôle `client` lié à un `clientId`) : demandes, prochaines collectes, historique, volumes, rapports téléchargeables, documents (maquettes `espace_client_*`, `suivi_de_mes_collectes`, `historique_rapports_client`). Toute requête filtrée côté serveur par `clientId` de la session, avec tests d'isolation entre clients.
- Notifications de base : demande reçue/validée, collecte planifiée, rapport disponible (e-mail).

### Lot 4 — Phase 5 : pilotage (à détailler dans `…-phase5-pilotage.md`)

- Remplacer le calcul en mémoire par des agrégations MongoDB ; ajouter index composés.
- Dashboard direction (PDF §13) : activité, volumes (client/site/temps), ressources (véhicules disponibles/affectés, équipes, interventions par équipe), performance (taux de réalisation, retards, fréquence, évolution) — maquettes `dashboard_direction`, `pilotage_performance_direction*`.
- Alertes : retard (persistance du statut `Retardée` par tâche planifiée), rappel J-1, mission nouvelle, échéance véhicule/équipement (SMS via fournisseur à choisir, e-mail existant).
- Rapports automatisés hebdomadaires/mensuels (PDF/CSV) envoyés à la direction.

### Lot 5 — Phase 6 : optimisation (à détailler dans `…-phase6-tournees.md`)

- Prérequis : coordonnées `localisation` renseignées sur ≥ 90 % des sites ; capacités véhicules fiables ; volumes réels (Lots 1.5 et 2).
- Version 1 : regroupement par zone/jour et proposition de tournée (heuristique plus proche voisin sous contrainte de capacité et de créneau) ; validation manuelle par le dispatcher (`sketch/optimisation_des_tourn_es`).
- Distances via un service de routage (à choisir), affichage carte.
- Ne pas engager cette phase sans données réelles de plusieurs mois.

---

## 4. Décisions à prendre avec le client / l'équipe

1. ~~Nom du client final~~ — tranché : SRH.
2. Nouveau départ sur `main` : réintégrer `7995783` par cherry-pick (recommandé) ou repartir de la branche de sauvegarde ?
3. Stockage des médias (Vercel Blob privé recommandé) et durée de conservation.
4. Canal de notification : e-mail seul, ou SMS (fournisseur ?) — budget.
5. Étapes réelles réception/traitement/valorisation et unité de référence des volumes (litres ? kg ?).
6. ~~Quantités à 0 du récapitulatif de juin~~ — tranché : ce ne sont pas des collectes ; l'import les écarte.
7. Contrat « cellule informatique dédiée » (PDF §18) : SLA, sécurité, sauvegardes — hors code mais à cadrer.

## 5. Auto-relecture du plan

- **Couverture du PDF :** §3 à §15 couverts (tableau §2) ; §16 par l'ordre des lots ; §18 signalé comme hors code.
- **Placeholders :** le Lot 0 est détaillé et exécutable ; les Lots 1 à 5 sont volontairement des feuilles de route de niveau tâche, chacun devant recevoir son plan détaillé avant exécution.
- **Cohérence :** les noms utilisés (`shouldSeed`, `Tracabilite`, `priseEnChargeAt`, `arriveeAt`, `SEED_ON_BUILD`) sont définis à l'endroit où ils apparaissent pour la première fois.
- **Limites de l'analyse :** le code de `7995783` a été lu, non exécuté ; le défaut `hardware` de `sw.js` est lisible dans la source mais non reproduit. Les pourcentages « réels » sont des estimations à re-mesurer après le Lot 0.
