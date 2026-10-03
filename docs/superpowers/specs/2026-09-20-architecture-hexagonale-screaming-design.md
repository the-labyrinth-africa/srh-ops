# Refactoring d'architecture : backend hexagonal, frontend « screaming » — Spécification de conception

**Date :** 20 septembre 2026
**Statut :** R0 à R7 réalisés (tous les domaines backend) ; jalons R8 (frontends) et R9 (clôture) à venir
**Portée :** application SRH Ops entière (≈ 11 000 lignes applicatives, ≈ 5 700 lignes de tests, 30 routes d'API, 16 pages).

## 1. Objectif

1. **Backend (Next.js ↔ base de données)** : architecture hexagonale stricte et pragmatique. Le métier ne connaît ni Mongoose, ni Next.js, ni NextAuth, ni Nodemailer.
2. **Frontend** : architecture « screaming » — l'arborescence crie le métier (opérations, terrain, comptes…), pas la technique (components, hooks, lib).
3. **Zéro régression** : aucun comportement ne change. Tous les tests passent à chaque commit.

### Hors périmètre

- Nouvelles fonctionnalités, changement de comportement, de libellé, de code HTTP ou de forme de réponse.
- Lots 1C (photos hors base, PWA) et suivants : ils se feront **sur** la nouvelle architecture.
- Changement de base de données ou d'ODM (Mongoose reste, derrière des adaptateurs).

## 2. Décisions arrêtées

| Décision | Choix |
|---|---|
| Organisation racine | **Deux arbres séparés** : `src/backend`, `src/frontend`, plus `src/shared` |
| Pureté du backend | **Stricte et pragmatique** : domaine et cas d'usage parlent à des ports ; entités = types/objets simples (pas de classes, pas d'agrégats riches) ; adaptateurs Mongoose convertissent document ↔ entité |
| Stratégie | **Migration progressive par domaine** (pilote : `equipes`), suite verte à chaque commit |
| Langue | Dossiers de domaine et vocabulaire métier en **français** (comme les schémas actuels) ; suffixes techniques en anglais (`Repository`, `UseCase`) |
| Injection de dépendances | **Fabriques simples** dans un `composition.ts` par domaine ; aucun conteneur |
| Frontière front/back | Le frontend n'importe **jamais** le backend (seulement `shared`) ; vérifié par test |

## 3. Arborescence cible

```
src/
├─ app/                          ← Next.js : fichiers fins qui ré-exportent
│  ├─ api/**/route.ts            export { GET, POST } from "@/backend/<domaine>/http/…"
│  ├─ (dashboard)/**/page.tsx    garde d'accès + composition de pages frontend
│  └─ layout.tsx, login/, forgot-password/, reset-password/, manifest.ts
├─ middleware.ts
├─ backend/
│  ├─ platform/                  socle transverse
│  │  ├─ base-de-donnees/        connexion Mongoose (connectDB)
│  │  ├─ email/                  port EnvoiEmail ; adaptateurs SMTP et mémoire
│  │  ├─ limiteur-debit/         port LimiteurDebit ; adaptateur Mongo
│  │  ├─ execution-differee/     after() avec repli
│  │  ├─ horloge/                Horloge, SystemClock
│  │  └─ http/                   identifiants Mongo, réponses, adresse client, URL applicative
│  ├─ operations/  recurrences/  clients-sites/  equipes/  vehicules/
│  │  equipements/  comptes/  import-donnees/  pilotage/
│  │  ├─ domain/                 types, règles pures, ports (interfaces)
│  │  ├─ application/            cas d'usage (une fonction/classe par intention)
│  │  ├─ infrastructure/         adaptateurs : mongoose/, pdf/, excel/, next-auth/, mail/
│  │  ├─ http/                   contrôleurs (route handlers) : Requête → cas d'usage → Réponse
│  │  ├─ composition.ts          assemblage adaptateurs + cas d'usage
│  │  └─ index.ts                API publique du domaine (seul point d'entrée pour les autres domaines)
├─ frontend/
│  ├─ operations/  terrain/  clients-sites/  equipes/  vehicules/  equipements/
│  │  recurrences/  import-donnees/  comptes/  pilotage/  navigation/
│  │  ├─ pages/                  vues composées (importées par src/app)
│  │  ├─ composants/
│  │  ├─ hooks/
│  │  ├─ api/                    client d'API typé de la fonctionnalité
│  │  └─ index.ts                API publique de la fonctionnalité
│  └─ design-system/             StatusBadge, EntityModal, SignaturePad, PhotoUpload, formatApiError, cn…
└─ shared/
   ├─ acces/                     rôles, permissions, matrice d'accès aux pages
   ├─ operations/                statuts, unités, schémas Zod partagés
   └─ …                          contrats communs (types d'API, Acteur)
```

`public/`, `scripts/`, `docs/` et les fichiers de configuration restent à la racine. `tsconfig.json` : alias `@/*` → `./src/*`. Les 76 imports de tests vers `@/app/...` restent valides ; les imports vers `@/lib` et `@/models` (≈ 100) sont réécrits mécaniquement domaine par domaine.

## 4. Règles de dépendance (vérifiées par test)

| # | Règle |
|---|---|
| R1 | `domain/` n'importe que `shared/` (et lui-même). |
| R2 | `application/` importe `domain/`, `shared/` et des **ports** ; jamais mongoose, next, next-auth, nodemailer, bcryptjs, jspdf, exceljs. |
| R3 | `infrastructure/` et `http/` importent `application/`, `domain/`, `shared/`, `platform/` ; `http/` peut importer `infrastructure/` uniquement via `composition.ts`. |
| R4 | `src/frontend/**` n'importe rien de `src/backend/**` ; seulement `shared/` et le `design-system`. |
| R5 | Un domaine (backend ou frontend) n'importe un autre domaine que par son `index.ts`. |
| R6 | `src/app/**` est la couche de composition : elle peut importer `frontend/*` et `backend/*/index.ts`/`http/*`. |

Contrôle : un test Vitest (`tests/architecture/regles-de-dependance.test.ts`) lit les imports de tous les fichiers `src/**` et échoue à la première violation ; complété par des règles ESLint `no-restricted-imports` par dossier.

**Exception assumée :** le domaine `comptes` possède l'identité (NextAuth, session → `Acteur`). Les contrôleurs des autres domaines obtiennent l'`Acteur` via `comptes/index.ts` (`exigerActeur(...)`).

## 5. Le concept d'`Acteur`

Type dans `shared/acces` : `{ id, role, clientId?, equipeId? }`. Les cas d'usage le reçoivent en paramètre et appliquent eux-mêmes le cloisonnement (client, équipe, rôle) par des politiques du domaine (par ex. `peutVoirOperation(acteur, operation)`), exactement avec les règles et codes d'erreur actuels. Le contrôleur ne fait que traduire la session en `Acteur` puis le résultat en réponse JSON.

## 6. Domaines, règles, cas d'usage et ports

| Domaine | Règles pures (`domain/`) | Cas d'usage (`application/`) | Ports principaux |
|---|---|---|---|
| `equipes`, `vehicules`, `equipements` | validations de champs | lister, obtenir, créer, modifier, supprimer | dépôt du domaine ; `RattachementsUtilisateurs` (409 si des comptes sont rattachés) |
| `clients-sites` | périmètre d'un compte client | CRUD clients et sites | dépôts clients et sites ; `RattachementsUtilisateurs` |
| `operations` | transitions de statut ; chevauchement (conflits) ; plafonds de photos (2 Mo / 8 Mo / 10) ; visibilité par rôle et équipe ; statut effectif | lister (filtres + périmètre), créer (avec conflit), modifier, supprimer, changer le statut (historique, champs terrain), ajouter/retirer une photo, planning, générer le rapport | `OperationRepository`, `Affectations`, `GenerateurRapportPdf`, `Horloge` |
| `recurrences` | prochaine échéance (ancre non dérivante, décalage horaire) | CRUD, générer sans doublon avec conflit | `RecurrenceRepository` ; création d'opération via `operations/index.ts` |
| `comptes` | cohérence rôle ↔ client/équipe ; validité d'une session après réinitialisation ; durées de vie des jetons | utilisateurs (créer + invitation, modifier + révocation de liens, supprimer, régénérer, envoyer un lien), mot de passe oublié, réinitialisation, changement de mot de passe, relecture du jeton de session, e-mail de test | `UtilisateurRepository`, `JetonRepository`, `HacheurMotDePasse`, `GenerateurDeSecrets`, `EnvoiEmail`, `LimiteurDebit`, `ExecutionDifferee`, `Horloge` |
| `import-donnees` | normalisation des noms de sites, quantités nulles rejetées, dates françaises | analyser, importer | `LecteurExcel` ; dépôts via `operations/index.ts` et `clients-sites/index.ts` |
| `pilotage` | statut effectif (retard), regroupements | statistiques | `StatistiquesQuery` (agrégation Mongo) |

## 7. Correspondance de l'existant (fichier → cible)

| Existant | Cible |
|---|---|
| `lib/api-auth.ts`, `lib/permissions.ts`, `lib/page-access.ts` | `shared/acces` (règles) ; `backend/comptes/http/acteur.ts` (adaptateur session) |
| `lib/page-auth.ts` | `backend/comptes/http/garde-pages.ts` |
| `lib/auth.ts`, `lib/auth-refresh.ts` | `backend/comptes/infrastructure/next-auth/` (+ règle pure de validité de session dans `domain/`) |
| `lib/auth/reset-token.ts`, `lib/auth/account-mail.ts`, `lib/users/scope.ts`, `lib/email.ts` | `backend/comptes/{domain,application,infrastructure}` |
| `lib/conflicts.ts`, `lib/status-transitions.ts` | `backend/operations/domain` (+ adaptateur `Affectations`) ; table des transitions dans `shared/operations/transitions.ts` (utilisée par le frontend) |
| `lib/excel-import.ts` | `backend/import-donnees/{domain,infrastructure/excel}` |
| `lib/db.ts`, `lib/mail/*`, `lib/rate-limit.ts`, `lib/run-after.ts`, `lib/app-url.ts`, `lib/mongo-id.ts` | `backend/platform/*` |
| `lib/validators/*`, `types/index.ts` | `shared/*` (schémas et types utilisés des deux côtés) ; sinon dans le domaine backend concerné |
| `lib/nav.ts`, `lib/status-styles.ts`, `lib/utils.ts`, `lib/api-error.ts`, `lib/image-compress.ts` | `frontend/navigation`, `frontend/design-system`, `frontend/terrain` |
| `lib/offline/outbox.ts`, `hooks/useOfflineSync.ts` | `frontend/terrain` |
| `models/*` | `backend/<domaine>/infrastructure/mongoose/` |
| `components/*` | `frontend/<fonctionnalité>/composants` (voir tableau du plan) |
| `middleware.ts`, `app/**` | `src/middleware.ts`, `src/app/**` |

## 8. Méthode de migration (recette par domaine)

1. **Filet.** Audit de couverture des routes du domaine ; tests de caractérisation pour les branches peu couvertes **avant** tout déplacement.
2. **Règles pures** extraites dans `domain/`, avec tests unitaires sans base.
3. **Ports + faux en mémoire, puis cas d'usage** en TDD, en recopiant fidèlement la logique des routes actuelles.
4. **Adaptateurs Mongoose** avec tests de contrat (MongoDB en mémoire).
5. **Contrôleurs fins**, fichiers de routes ré-exportés, ancien code supprimé.
6. **Frontend** de la fonctionnalité : déplacement, client d'API typé, hooks séparés ; aucun changement visuel.
7. **Validation** : suite complète, test d'architecture, revue (revue de sécurité renforcée pour `comptes`).

### Ordre

0. **Fondations** : passage à `src/`, `shared/`, `platform/`, test d'architecture (d'abord en mode observation, puis bloquant à la clôture de chaque domaine).
1. `equipes` (pilote : valide le modèle de bout en bout).
2. `vehicules`, `equipements`.
3. `clients-sites`.
4. `comptes` (sensible : authentification, invitation, réinitialisation, jetons).
5. `operations` (le plus gros).
6. `recurrences`, `import-donnees`, `pilotage`.
7. `navigation` et `design-system`.
8. Clôture : réorganisation miroir des tests, règles ESLint, documentation d'architecture, contrôle qu'il ne reste rien dans les anciens `lib/`, `models/`, `components/`, `hooks/`, `types/`.

## 9. Garde-fous

- Les 456 tests passent à chaque commit ; seuls les chemins d'import des tests changent.
- Aucun code de retour, corps de réponse ni message ne change : les tests d'intégration appellent les vraies routes et servent d'oracle.
- Un domaine n'est déclaré migré que si son ancien code est supprimé et si le test d'architecture passe pour lui.
- Contraintes Next.js : les fichiers `route.ts` doivent rester sous `src/app/api/**` ; les exports de configuration de segment (`dynamic`, `runtime`, `maxDuration`) doivent être déclarés littéralement dans le fichier de route, pas ré-exportés.
- Sécurité : les agents n'accèdent ni au `.env.local` ni à l'envoi d'e-mails réels ; `npm run build` n'est jamais lancé contre la base réelle.

## 10. Risques et parades

| Risque | Parade |
|---|---|
| Régression silencieuse d'une règle en la déplaçant | Tests de caractérisation avant déplacement ; tests d'intégration existants inchangés ; revue par domaine |
| Conversion document ↔ entité qui change une forme de réponse (ex. `populate`) | Les adaptateurs renvoient exactement les mêmes formes ; tests de contrat + tests d'intégration existants |
| Dérive de l'architecture après la migration | Test d'architecture bloquant dans la suite + règles ESLint |
| Un déplacement casse l'inférence de types Mongoose | Schémas Mongoose inchangés, seulement déplacés ; `tsc` à chaque commit |
| Instabilité des tests (MongoDB en mémoire) | Reprise déjà en place dans `tests/setup.ts` ; ne pas paralléliser davantage |
| Ampleur (≈ 15 tâches) | Un domaine = un jalon fusionnable ; possibilité de s'arrêter après n'importe quel domaine avec une application cohérente |

## 11. Critères de fin

- [ ] `npx vitest run` : tout vert (≥ 456 tests + nouveaux tests unitaires de domaine et test d'architecture).
- [ ] `npx tsc --noEmit` propre ; `npm run lint` : 0 erreur.
- [ ] Aucun fichier applicatif hors de `src/` ; plus de `lib/`, `models/`, `components/`, `hooks/`, `types/` à la racine.
- [ ] Règles R1 à R6 vérifiées par test.
- [ ] Aucun changement de code HTTP, de corps de réponse, de libellé ou de règle métier (comparaison des tests d'intégration inchangés).
- [ ] README : section « Architecture » (arborescence, règles, comment ajouter un cas d'usage ou une fonctionnalité).
