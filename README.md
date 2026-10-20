# WOM — Waste Operations Manager

Plateforme de planification et de suivi des opérations de collecte.

## Stack

- Next.js 16 (App Router) + TypeScript
- MongoDB Atlas + Mongoose
- NextAuth.js (credentials + rôles)
- Tailwind CSS v4 (design system Industrial Integrity)
- FullCalendar (planning)

## Architecture

Tout le code applicatif vit sous `src/` (les dossiers `scripts/`, `public/`, `tests/`, `docs/` et `sketch/` restent à la racine, ainsi que `next.config.ts`). Le middleware d'authentification est `src/middleware.ts` (export par défaut explicite, exigé par Next 16).

- `src/backend/<domaine>/` : un domaine métier par dossier, en architecture hexagonale. `src/backend/platform/` regroupe les briques techniques transverses (pas un domaine métier, pas de séparation `domain/`/`application/`) : `base-de-donnees/` (connexion Mongoose) et `http/identifiants.ts` (identifiants Mongo) depuis R0 ; `email/` (envoi SMTP/mémoire), `limiteur-debit/`, `execution-differee/`, `horloge/` (introduite par anticipation de 3b/R4 — premier appelant depuis R3b, `comptes/composition.ts`) et l'ajout à `http/` de l'adresse client et de l'URL applicative, depuis R3a.
- `src/frontend/<fonctionnalité>/` : une fonctionnalité métier par dossier (« screaming »), plus `src/frontend/design-system/` (composants génériques).
- `src/shared/` : types, rôles, permissions et règles pures utilisables des deux côtés (aucune dépendance technique).
- `src/app/` : couche de composition Next (pages et routes). Les `route.ts` ne font que ré-exporter les contrôleurs du domaine.

Un domaine backend contient `domain/` (entités, erreurs métier, ports), `application/` (cas d'usage), `infrastructure/` (adaptateurs Mongoose et faux en mémoire), `http/` (contrôleurs, schémas Zod, présentation JSON), `composition.ts` (assemblage) et `index.ts` (seule API visible des autres domaines).

Les règles de dépendance R1 à R6 sont vérifiées par `tests/architecture/regles-de-dependance.test.ts`; ESLint complète les règles les plus courantes. Le vérificateur parcourt `src/app/**` et n'autorise que la composition documentée ci-dessous.

- **R1** : `domain/` n'importe que `shared/` et lui-même.
- **R2** : `application/` n'importe que `domain/`, `shared/` et des ports ; jamais mongoose, next, next-auth, nodemailer, bcryptjs, jspdf ni exceljs.
- **R3** : `infrastructure/` et `http/` importent `application/`, `domain/`, `shared/`, `platform/` ; `http/` n'atteint `infrastructure/` que via `composition.ts`.
- **R4** : `src/frontend/**` n'importe rien de `src/backend/**` (ni mongoose, ni les modèles) ; seuls `shared/`, le `design-system` et l'API publique d'autres fonctionnalités frontend sont autorisés. Aucun dossier hérité (`src/lib/`, `src/models/`, `src/components/`, `src/hooks/`) n'est conservé ni importé.
- **R5** : un domaine n'en importe un autre que par son `index.ts`.
- **R6** : `src/app/**` compose : elle peut importer `frontend/*`, `shared/`, les `index.ts` publics des domaines et les contrôleurs HTTP uniquement depuis les routes API. L'unique exception infrastructure est `auth/[...nextauth]/route.ts`, qui charge les options NextAuth.

Ajouter un cas d'usage : déclarer le port dans `domain/ports.ts` ; écrire le cas d'usage dans `application/` avec son test sur le faux en mémoire (`infrastructure/en-memoire/`) ; implémenter l'adaptateur Mongoose (`infrastructure/mongoose/`) ; brancher le tout dans `composition.ts` ; écrire le contrôleur dans `http/` ; enfin ré-exporter le gestionnaire depuis le `route.ts` concerné (exemple : `src/app/api/equipes/route.ts`).

Les tests d'intégration sont regroupés par domaine sous `tests/integration/<domaine>/`. Les tests unitaires de règles et d'adaptateurs restent à côté du code testé; les tests de règles d'architecture sont dans `tests/architecture/`.

État de la migration : les domaines `equipes`, `vehicules`, `equipements` et `clients-sites` (backend `src/backend/<domaine>`, frontend `src/frontend/<domaine>`) sont migrés ; `equipes` sert de modèle. `clients-sites` regroupe deux entités liées (`Client`, `Site`) dans un seul dossier de domaine. Le backend de `comptes` (`src/backend/comptes`) est migré (R3a : socle `platform` ; R3b : domaine, ports, adaptateurs et cas d'usage — utilisateurs, mot de passe oublié/réinitialisation/changement, e-mail de test ; R3c : identité NextAuth, entité `Acteur`, gardes de pages et de routes) ; son frontend est désormais dans `src/frontend/comptes/` (R8). Le backend d'`operations` (`src/backend/operations`) est **migré** (jalon R4) : R4a — règles pures (statut effectif, conflits, visibilité ; transitions dans `src/shared/operations/transitions.ts`) ; R4b — modèle `src/backend/operations/infrastructure/mongoose/operation.model.ts`, schémas Zod `src/backend/operations/http/operation.schema.ts`, entité, dépôt, cas d'usage et contrôleurs de la liste, de la création, du détail, de la modification, de la suppression et du planning ; R4c — changement de statut avec historique et données de terrain, ajout et retrait de photos ; R4d — rapport PDF (port `GenerateurRapportPdf`, adaptateur jsPDF `src/backend/operations/infrastructure/pdf/generateur-rapport.jspdf.ts`). Toutes les routes `src/app/api/operations/**` sont des ré-exports ; les frontends opérations et terrain sont dans `src/frontend/{operations,terrain}/` (R8). Le backend de `recurrences` (`src/backend/recurrences`) est **migré** (jalon R5) : calcul des occurrences en règle pure (`domain/occurrences.ts`), CRUD, génération des opérations par l'API publique d'`operations` (`existeOperationSurCreneau`, `creerOperationPlanifiee`, `checkAssignmentConflicts`) ; les routes `src/app/api/recurrences/**` sont des ré-exports et le frontend est dans `src/frontend/recurrences/` (R8) ; le dossier `src/models` n'existe plus. Le backend d'`import-donnees` (`src/backend/import-donnees`) est **migré** (jalon R6) : interprétation des dates et des quantités et détection des en-têtes en règles pures (`domain/lecture.ts`), lecteur ExcelJS dans `infrastructure/excel/`, cas d'usage `analyser` et `importer`, sites et opérations créés par l'API publique de `clients-sites` et d'`operations` ; la route `src/app/api/import` est un ré-export et le frontend est dans `src/frontend/import-donnees/` (R8). Le backend de `pilotage` (`src/backend/pilotage`) est **migré** (jalon R7) : compteurs par statut effectif, opérations en retard et bornes du jour en règles pures, modèle de lecture `StatistiquesQuery` (requêtes directes par nom de modèle, sans import des modèles des autres domaines) ; la route `src/app/api/dashboard/stats` est un ré-export. Le rendu du tableau de bord est dans `src/frontend/pilotage/` et sa page Next en fournit les données après contrôle d'accès (R8). **Les frontends restants sont migrés (R8)** : `navigation`, `design-system`, `operations`, `terrain`, `comptes`, `recurrences`, `import-donnees`, `pilotage` et `tracabilite`. Le test d'architecture inclut ces fonctionnalités. Les répertoires hérités `src/components/`, `src/lib/` et `src/hooks/` sont vides ; leur suppression et les dernières règles d'architecture restent au jalon R9.

Clôture R9 : tous les domaines backend et toutes les fonctionnalités frontend sont migrés. Les tests d'intégration sont classés par domaine, les règles R1 à R6 sont contrôlées (dont `src/app/**`) et les imports vers les dossiers legacy sont interdits. La règle de périmètre client appartient désormais à `clients-sites/domain/`. Le plan R9 consigne les deux seules vérifications conservées du test de stockage des jetons.

Phase 4 ajoute les domaines `src/backend/demandes-clients/` (collecte publique, qualification et conversion idempotente) et `src/backend/espace-client/` (lecture bornée par client), ainsi que `src/frontend/espace-client/`. Phase 5 ajoute `src/backend/notifications/` (file SMTP persistante, idempotente et réessayable), les alertes planifiées via Cron Vercel et les tendances/exports CSV dans `pilotage`. Ces domaines suivent les mêmes règles de dépendance et sont couverts par le test d'architecture.

Le guide utilisateur est disponible dans l'application à `/guide`, après connexion. Son contenu est filtré selon le rôle connecté : l'administrateur peut consulter tous les chapitres de l'entreprise, le super administrateur voit aussi le chapitre de configuration plateforme, le dispatcher voit son guide et celui de lecture seule, et les rôles Chauffeur et Client disposent chacun de leur guide dédié.

## Super administrateur et identité de l'entreprise

Le rôle `superadmin` est réservé à la plateforme. Il n'est pas proposé dans la gestion des
utilisateurs de l'entreprise et ne peut pas être attribué par un administrateur.
L'identité de l'entreprise (nom, sigle, site web et logo) se gère dans
`/plateforme/entreprise`. Elle apparaît dans le menu et sur les rapports PDF. Le favicon et
l'identité du produit restent WOM.

Au déploiement de production, le build crée automatiquement le super administrateur à partir
des quatre variables ci-dessous. Renseignez-les dans les variables d'environnement de
production, avec `MONGODB_URI`. Les builds Preview ne créent aucun compte. Pour un hébergement
hors Vercel, activez le seed du build avec `PLATFORM_SEED_ON_BUILD=true`. En local, la commande
`npm run seed:superadmin` reste disponible. Le mot de passe doit faire au moins 12 caractères
et sera remplacé à la première connexion.

```text
PLATFORM_SUPERADMIN_USERNAME
PLATFORM_SUPERADMIN_NAME
PLATFORM_SUPERADMIN_EMAIL
PLATFORM_SUPERADMIN_PASSWORD
```

Le seed est idempotent : si un super administrateur existe déjà, il ne le modifie pas. Après sa
première connexion et le changement de son mot de passe, le super administrateur ouvre
`/plateforme/entreprise` et crée le premier compte Admin Ops. Ce compte reçoit une invitation
par e-mail ou, si l'envoi échoue, un mot de passe temporaire à transmettre de manière sécurisée.
Une fois créé, le super administrateur ne peut plus créer un autre compte initial ; l'Admin Ops
gère ensuite les autres utilisateurs depuis la page Utilisateurs.

Ne publiez jamais ces valeurs dans le dépôt ou dans les identifiants de démonstration.

## Accès de démonstration publics

Ces identifiants sont volontairement publics et sont à utiliser **uniquement** sur l'instance de démonstration WOM. La page de connexion permet aussi de remplir automatiquement le formulaire avec le compte choisi.

| Rôle | Identifiant | Mot de passe |
|---|---|---|
| Admin Ops | `wom-test-admin` | `WomDemo-admin-_XWrBoHzB-pGxLZFme4bytIp` |
| Dispatcher | `wom-test-dispatcher` | `WomDemo-dispatcher-LiUoMb9Tuw_C4Y_mK-uP-9aG` |
| Chauffeur / Terrain | `wom-test-chauffeur` | `WomDemo-chauffeur-vZ6m1EX-C-BwZcHi_7ro2e7O` |
| Espace Client | `wom-test-client` | `WomDemo-client-Y4t24Ypg7GzBI4VBIqACBM9u` |
| Lecture seule | `wom-test-lecture` | `WomDemo-lecture-UAKLpNUD2O-Sim83UgFX1b6m` |

**Important :** ces comptes sont partagés. Les modifications faites par un testeur sont visibles par les autres. Ne saisissez aucune donnée personnelle, réelle ou confidentielle. Ne configurez jamais ces identifiants sur une base de production. Les adresses e-mail associées utilisent le domaine réservé `.invalid` et ne reçoivent pas de courrier.

Vérifier la compilation Next sans toucher à la vraie base (variables factices, jamais l'URI réelle) :

```bash
MONGODB_URI="mongodb://127.0.0.1:9/inexistant" NEXTAUTH_SECRET="verification-build" \
NEXTAUTH_URL="http://localhost:3001" NEXT_TELEMETRY_DISABLED=1 npx next build
```

### Notes de migration (écarts connus et voulus des domaines migrés)

- La réponse JSON du `POST /api/equipes`, `/api/vehicules`, `/api/equipements`, `/api/clients` et `/api/sites` (201) liste `_id` en premier ; les clés et les valeurs sont celles d'avant. Plus généralement, cette migration présente les réponses avec un ordre de clés canonique et stable, plutôt que l'ordre BSON brut d'origine, qui pouvait varier selon l'historique des écritures d'un document : sur `comptes`, un champ posé par un `$set` partiel ultérieur (`clientId` rattaché par un `PUT` après la création du compte, ou `passwordChangedAt` posé par une réinitialisation de mot de passe) apparaît ainsi en fin de document sur `main`, mais à sa position canonique sur cette branche. Différence sans portée fonctionnelle : l'ordre des clés JSON n'a pas de sens sémantique, et tous les consommateurs ici sont du JavaScript/JSON.
- Les lectures « lean » passent par l'entité : un champ inconnu du schéma (document écrit hors Mongoose) n'est plus renvoyé ; un champ du schéma absent du document — quelle qu'en soit la cause (document écrit hors Mongoose, ou sous-clé disparue lors d'une mise à jour Mongoose partielle sur un objet imbriqué : par exemple `PUT /api/clients/[id]` avec un `contact` vide fait disparaître `contact.email` du document stocké) — est présenté avec sa valeur par défaut plutôt qu'omis (`type` → chaîne vide, `capacite` → 0, `membres` → liste vide pour les équipes ; `contact.telephone`/`contact.email` → chaîne vide pour un client).
- `GET /api/sites` et `GET /api/sites/[id]` peuplent `clientId` (`{_id, nom}` du client, ou `null` si le client référencé a été supprimé — aucune garde de rattachement ne l'empêche) ; `POST`/`PUT /api/sites` renvoient `clientId` non peuplé (l'identifiant brut). Comportement identique à avant migration. `Utilisateur.clientId`/`equipeId` (domaine `comptes`) ajoutent un troisième état à peuplé/`null` pendant : le champ peut aussi être **absent** de la réponse quand le compte n'a jamais été rattaché à un client ou une équipe (par exemple un compte `admin` ou `dispatcher`) — comportement déjà présent avant migration (les routes d'origine omettaient déjà la clé dans ce cas), noté ici car `comptes` est le premier domaine migré à exercer les trois états ; un futur domaine avec une relation peuplée optionnelle similaire devrait distinguer explicitement « jamais renseigné » de « renseigné mais pendant » plutôt que de les confondre.
- `POST /api/mail/test` renvoie désormais `Cache-Control: no-store` sur ses réponses 403 et 404, que `main` n'avait pas sur ces deux cas précis (toutes les autres réponses de cette route l'avaient déjà sur `main`, tout comme la 403 de la route sœur `send-reset-link`, qui porte la même vérification de rôle admin). Écart accepté : il ne fait qu'ajouter un en-tête de cache protecteur à des réponses d'erreur, jamais en retirer, et corrige une incohérence de l'existant plutôt que d'introduire un comportement nouveau arbitraire.
- Les opérations (`/api/operations`, `/api/operations/[id]`, la réponse de `PATCH /api/operations/[id]/statut` et le rapport PDF) sont lues par l'entité : une opération dont un champ du schéma est absent **ou vaut `null`** en base (document écrit hors Mongoose, ou opération créée avant l'ajout de ce champ au schéma) est présentée avec la valeur par défaut du schéma (`dureeEstimeeMinutes: 120`, tableaux vides, `uniteQuantite: "Litres"`, chaînes vides ; `clientId`/`siteId` absents → `null`) ; les champs facultatifs sans défaut (`equipeId`, `vehiculeId`, `quantiteCollectee`) restent omis ; l'ordre des clés JSON peut différer. Le planning (`/api/operations/planning`), lui, est inchangé.
- R4c : un compte client sans `clientId` est désormais refusé (403) par les cas d'usage de lecture des opérations ; chemin inatteignable en pratique, la garde d'authentification le refusant déjà.
- R4c : écart connu, sous concurrence uniquement : pour le changement de statut et les photos, les contrôles portent sur un instantané de l'opération puis le dépôt recharge le document pour écrire (l'origine travaillait sur un seul document) ; si deux écritures se croisent, `ancienStatut` ou les plafonds de photos peuvent être évalués sur un état périmé, et une opération supprimée entre les deux lectures donne un 404.

## Démarrage

```bash
npm install
cp .env.local.example .env.local   # ou utiliser .env.local existant
npm run seed                       # identifiant admin / mot de passe de démonstration
npm run dev
```

Ouvrir [http://localhost:3001](http://localhost:3001)

## Variables d'environnement

```env
MONGODB_URI=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3001
# E-mail (SMTP) : voir la section « E-mail (SMTP) »
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM=
CRON_SECRET=
```

## Comptes seed

| Email | Mot de passe | Rôle |
|-------|--------------|------|
| admin | admin123 | admin |
| dispatcher | dispatch123 | dispatcher |

## Rôles et accès

Cinq rôles existent : `admin`, `dispatcher`, `lecture`, `chauffeur`, `client`. L'accès aux
pages est décrit par une matrice unique, `src/shared/acces/acces-pages.ts`, qui alimente la protection
des pages serveur (`src/backend/comptes/http/garde-pages.ts`), le menu (`src/lib/nav.ts`) et les tests. Un chemin absent
de la matrice est refusé à tous (refus par défaut) ; un accès refusé redirige vers la page
d'accueil du rôle (`/terrain` pour un chauffeur, `/acces-limite` pour un client, `/` sinon).

| Chemin | admin | dispatcher | lecture | chauffeur | client |
|---|:-:|:-:|:-:|:-:|:-:|
| `/` (tableau de bord) | ✓ | ✓ | ✓ | → `/terrain` | → `/acces-limite` |
| `/operations`, `/operations/planning` | ✓ | ✓ | ✓ | ✗ | ✗ |
| `/operations/nouveau` | ✓ | ✓ | ✗ | ✗ | ✗ |
| `/operations/<id>` | ✓ | ✓ | ✓ | ✓ | ✗ |
| `/recurrences`, `/clients`, `/equipes`, `/vehicules`, `/equipements` | ✓ | ✓ | ✓ | ✗ | ✗ |
| `/import` | ✓ | ✓ | ✗ | ✗ | ✗ |
| `/utilisateurs` | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/terrain` | ✓ | ✓ | ✗ | ✓ | ✗ |
| `/profil` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/acces-limite` | ✗ | ✗ | ✗ | ✗ | ✓ |

`/profil` est ouvert à tous les rôles authentifiés : c'est aussi la seule page accessible
à un compte dont le mot de passe temporaire n'a pas encore été changé.

### Rattachement des comptes

- Un compte `client` doit être rattaché à un client (`clientId`) ; un compte `chauffeur`
  doit être rattaché à une équipe (`equipeId`). Les autres rôles ne portent aucun
  rattachement. Ces règles sont vérifiées à la création et à la modification d'un
  utilisateur (validation des identifiants Mongo, refus des combinaisons incohérentes).
- Un compte `client` sans `clientId` en session est refusé partout par l'API (403).
- Un compte `chauffeur` sans `equipeId` en session n'agit sur aucune opération (403,
  « Compte chauffeur sans équipe attribuée »).

### API : ce qui a changé pour les chauffeurs

Côté API, un chauffeur est limité aux opérations de son équipe :

- Listes (`/api/operations`, `/api/operations/planning`) : filtrées par son équipe côté
  serveur, quels que soient les paramètres de requête envoyés.
- Lecture par identifiant et rapport PDF : 404 « Non trouvé » hors de son équipe (l'existence
  de l'opération n'est pas révélée). Changement de statut et photos : 403
  « Opération non affectée à votre équipe ». Une opération sans équipe est invisible pour un
  chauffeur.
- Il n'a aucun accès aux clients, sites, équipes, véhicules, équipements, récurrences,
  import ni statistiques du tableau de bord (403), même en lecture. Les clients et sites
  restent lisibles par le personnel et, dans son périmètre, par un compte `client`.
- Il peut écrire côté terrain (statut, données de collecte, photos) mais ne peut ni créer
  ni modifier une opération.

### Mot de passe temporaire

Un mot de passe créé ou régénéré par un administrateur est temporaire (`mustChangePassword`).
Il n'est jamais envoyé par e-mail : l'administrateur le reçoit dans la réponse de l'API, une
seule fois, à la régénération (et à la création uniquement en repli, si l'invitation n'a pas
pu être envoyée). Tant qu'il n'est pas changé :

- toute page du tableau de bord redirige vers `/profil?forcer=1` ;
- toute route API répond 403 avec le code `MUST_CHANGE_PASSWORD`, sauf le changement de mot
  de passe lui-même (`POST /api/auth/change-password`) ;
- le drapeau est relu en base à chaque requête tant qu'il est actif, et retombe dès que le
  mot de passe est changé.

### Mot de passe oublié, invitations et liens de réinitialisation

Les liens d'invitation et de réinitialisation sont des jetons aléatoires de 32 octets : seule
leur empreinte SHA-256 est stockée (collection `passwordresettokens`), jamais le jeton lui-même.

- **Invitation** : à la création d'un compte, l'utilisateur reçoit par e-mail un lien
  d'activation valable **72 heures**, à **usage unique**, pour choisir son mot de passe. Le
  mot de passe temporaire généré n'est affiché à l'administrateur qu'en repli, si l'e-mail
  n'a pas pu être envoyé (voir « E-mail (SMTP) »).
- **Mot de passe oublié** (`/forgot-password`, `POST /api/auth/forgot-password`) : l'utilisateur
  saisit son identifiant ou son e-mail et reçoit un lien valable **30 minutes**, à **usage
  unique**. La réponse est identique que le compte existe ou non (aucune énumération de
  comptes) ; la recherche et l'envoi se font après la réponse.
- **Limites de débit** : 5 demandes par heure et par identifiant, 10 par heure et par
  adresse IP (réponse 429 au-delà, avec `Retry-After`). Note d'exploitation : un utilisateur
  visé par des demandes répétées (volontaires ou non) peut se retrouver temporairement dans
  l'impossibilité de demander un lien ; un administrateur peut alors lui envoyer un lien
  lui-même. La consommation d'un lien (`POST /api/auth/reset-password`) est limitée à 20
  tentatives par heure et par IP.
- **Un seul lien actif par compte et par finalité** : émettre un nouveau lien de réinitialisation invalide le précédent lien de réinitialisation non utilisé, et une nouvelle invitation la précédente invitation ; une demande publique de réinitialisation ne détruit donc pas une invitation encore en attente. Choisir un mot de passe (par lien ou depuis « Mon Compte ») révoque tous les liens encore en attente, quelle que soit leur finalité.
- **Action administrateur « Envoyer un lien de réinitialisation »** (« Utilisateurs & Rôles »,
  `POST /api/users/[id]/send-reset-link`) : envoie à l'utilisateur un lien de réinitialisation
  (30 minutes) sans toucher à son mot de passe actuel ; limitée à 5 liens par heure et par
  compte. Si l'e-mail ne peut pas partir, l'API répond 502 (`sent: false`) et l'administrateur
  peut recourir à « Régénérer le mot de passe ».
- **Révocation** : régénérer le mot de passe d'un utilisateur ou modifier son adresse e-mail
  invalide tous ses liens en attente (invitation ou réinitialisation) ; l'administrateur peut
  ensuite envoyer un nouveau lien.
- **Échec d'infrastructure** : si la base ou le limiteur est indisponible, `POST /api/auth/reset-password` répond 503 (« Service momentanément indisponible. Réessayez plus tard ou demandez un nouveau lien. ») (l'utilisateur peut redemander un lien) ; un lien refusé répond 400 avec le code stable `INVALID_LINK`.
- **Sessions ouvertes** : une réinitialisation par lien (comme une régénération) renseigne
  `passwordChangedAt` ; les sessions déjà ouvertes du compte sont invalidées au plus 5 minutes
  plus tard (voir ci-dessous). Un e-mail de confirmation « mot de passe modifié » est envoyé
  après une réinitialisation par lien (pas après l'activation d'une invitation, où le titulaire
  choisit son tout premier mot de passe).

### E-mail (SMTP)

L'envoi passe par SMTP (`nodemailer`). Sans `SMTP_HOST`, aucun transport n'est configuré :
les e-mails ne partent pas (un avertissement sans contenu est journalisé). Si `SMTP_HOST` est
renseigné mais que `SMTP_USER` ou `SMTP_PASSWORD` manque, ou que `SMTP_PORT` est invalide,
l'envoi échoue avec une erreur de configuration qui ne nomme que les variables concernées.
`SMTP_PORT` doit être un entier décimal entre 1 et 65535, et un `SMTP_PASSWORD` uniquement composé
d'espaces compte comme absent. `MAIL_TRANSPORT=memory` est réservé aux tests et refusé en production.

| Variable | Rôle | Exemple |
|---|---|---|
| `SMTP_HOST` | serveur SMTP | `smtp.votre-entreprise.com` |
| `SMTP_PORT` | port (465 par défaut) | `465` (SSL) ou `587` (STARTTLS) |
| `SMTP_SECURE` | `true` = SSL dès la connexion ; `false` = STARTTLS ; absent = déduit du port (`true` pour 465) | `true` avec 465, `false` avec 587 |
| `SMTP_USER` | boîte d'authentification | `contact@votre-entreprise.com` |
| `SMTP_PASSWORD` | mot de passe de cette boîte | **secret**, voir ci-dessous |
| `MAIL_FROM` | expéditeur affiché | `"WOM <contact@votre-entreprise.com>"` (par défaut : `WOM <SMTP_USER>`) |
| `NEXTAUTH_URL` | URL publique servant à construire les liens des e-mails | voir ci-dessous |

**Où renseigner le mot de passe SMTP** : uniquement dans `.env.local` en local (fichier ignoré
par Git), et sur Vercel dans **Settings → Environment Variables** avec le mode **Sensitive**,
pour les environnements **Production** et **Preview**. Ne jamais le committer ni le coller
dans un ticket ou une conversation.

**`NEXTAUTH_URL`** : les liens d'invitation et de réinitialisation sont construits à partir de
cette variable. En production, elle doit être l'URL publique en `https://` (par exemple
`https://<projet>.vercel.app` ou le domaine de votre entreprise) ; hors `https://`, aucun lien n'est émis en
production (l'envoi est alors traité comme un échec). L'URL est vérifiée avant l'émission du jeton : si elle est invalide, aucun jeton n'est créé (les liens déjà en attente restent intacts) et la réponse de « Mot de passe oublié » reste générique. En local, `http://localhost:3001` correspond au port configuré pour `npm run dev`.

**Tester l'envoi** :

- en ligne de commande, sans base de données (lit `.env.local`) :
  `npx tsx scripts/send-test-mail.ts adresse@exemple.com` ;
- depuis l'application, en tant qu'administrateur : page « Mon Compte & Sécurité » (`/profil`),
  bouton « Envoyer un e-mail de test à mon adresse » (limité à 5 par heure).

Le script refuse de s'exécuter avec le transport mémoire (`MAIL_TRANSPORT=memory` ou `NODE_ENV=test`) : il affiche « Transport mémoire actif : aucun e-mail n'est réellement envoyé. » et se termine avec le code 1, au lieu d'annoncer un envoi qui n'a pas eu lieu.

**Délivrabilité** : l'expéditeur (`MAIL_FROM`) doit correspondre à la boîte authentifiée
(`SMTP_USER`). Vérifiez auprès de l'hébergeur de messagerie que les enregistrements SPF et DKIM
du domaine d'envoi sont configurés, faute de quoi les messages risquent de finir en courrier indésirable.

**En cas d'échec d'envoi** (SMTP absent, mal configuré ou en panne) :

- création d'un compte : le compte est créé quand même ; la réponse contient
  `invitation: "not_sent"` et le mot de passe temporaire, affiché une seule fois à
  l'administrateur pour qu'il le transmette (repli) ;
- action « Envoyer un lien de réinitialisation » : réponse 502, rien n'est envoyé ;
- « Mot de passe oublié » : la réponse générique est inchangée (aucune information sur le
  compte) et aucun e-mail ne part ; l'utilisateur doit s'adresser à un administrateur ;
- les journaux ne contiennent ni corps, ni lien, ni jeton, ni mot de passe, ni adresse
  e-mail : seuls l'objet du message et le nom de l'erreur sont tracés.
- les notifications métier sont placées dans une file MongoDB persistante, retentées avec un
  délai exponentiel jusqu'à huit tentatives et conservées 90 jours après leur état final.

## Phase 5 — Notifications et pilotage avancé

Les notifications utilisent le transport SMTP déjà décrit plus haut :

- une nouvelle demande publique alerte les comptes **Admin** et **Dispatcher** ;
- la qualification d'une demande et les changements de statut d'une opération avertissent les
  comptes **Client** rattachés au client concerné ;
- un rappel client est envoyé pour les opérations planifiées/affectées dans les prochaines
  24 heures ; chaque jour, les opérations échues non terminées alertent le dispatch ;
- les clés de déduplication empêchent un même événement d'être ajouté plusieurs fois, y compris
  quand le job Cron est invoqué à nouveau. Les échecs SMTP sont retentés automatiquement.

Vercel appelle `GET /api/cron/notifications` chaque jour à 07:00 UTC (08:00 à Abidjan), via la
configuration de [vercel.json](./vercel.json). La route exige `Authorization: Bearer <CRON_SECRET>`
et retourne 503 si `CRON_SECRET` est absent. Générer une valeur aléatoire (par exemple
`openssl rand -hex 32`) et la définir en **Sensitive** dans Vercel ainsi qu'en local. Pour
exécuter le contrôle manuellement, fournir le même en-tête Bearer ; ne pas exposer le secret.
Les alertes qui dépendent d'un compte destinataire nécessitent que les comptes client et dispatch
aient une adresse e-mail valide. La livraison réelle dépend également d'une configuration SMTP
valide.

Le tableau de bord interne présente une tendance des six derniers mois par statut effectif et
permet l'export CSV d'une période choisie. L'API `/api/dashboard/export` exige une session
interne, limite la période à 366 jours et le résultat à 5 000 opérations ; les cellules textuelles
sont neutralisées contre les formules CSV/Excel. Un dépassement est signalé sans tronquer le
fichier.

**Purge et durée de vie des jetons** : les documents de la collection `passwordresettokens`
sont supprimés automatiquement 24 h après leur expiration (index TTL sur `expiresAt`). Changer
cette durée impose de supprimer d'abord l'index TTL existant dans MongoDB (par exemple
`db.passwordresettokens.dropIndex("expiresAt_1")`) : sinon Mongoose refuse, à l'initialisation,
de créer l'index modifié car il entre en conflit avec l'existant. (La durée de validité des
liens elle-même, 30 min / 72 h, est vérifiée dans le code, pas par cet index.)

### Actualisation du jeton de session

Le jeton de session (JWT) est relu en base au plus toutes les 5 minutes
(`REFRESH_INTERVAL_MS` dans `src/backend/comptes/infrastructure/next-auth/rafraichissement.ts`) : un changement de rôle ou de
rattachement s'applique donc au plus 5 minutes après la dernière relecture, dès la requête
suivante, sans nouvelle connexion, et un compte supprimé perd son accès (session refusée) à
la relecture suivante.

### Suppression d'un client ou d'une équipe

`DELETE /api/clients/[id]` et `DELETE /api/equipes/[id]` répondent 409 (« Ce client est
rattaché à des comptes utilisateurs » / « Cette équipe est rattachée à des comptes
utilisateurs ») tant qu'un compte y est rattaché : il faut d'abord modifier ou supprimer ces
comptes.

## Déploiement sur Vercel

1. Pousser le repo sur GitHub, puis importer le projet dans [Vercel](https://vercel.com/new) (framework détecté automatiquement : Next.js).
2. Dans **Project Settings → Environment Variables**, définir pour les environnements Production/Preview :

   | Variable | Valeur |
   |----------|--------|
   | `MONGODB_URI` | URI de connexion MongoDB Atlas |
   | `NEXTAUTH_SECRET` | secret généré via `openssl rand -base64 32` (différent du secret de dev) |
   | `NEXTAUTH_URL` | URL publique du déploiement, ex. `https://<projet>.vercel.app` (ne pas laisser une URL localhost) |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `MAIL_FROM` | configuration SMTP (voir « E-mail (SMTP) ») |
   | `SMTP_PASSWORD` | mot de passe de la boîte SMTP, en mode **Sensitive** |
   | `CRON_SECRET` | secret aléatoire pour authentifier le Cron des notifications, en mode **Sensitive** |

   Pour **Production uniquement**, ajouter aussi `PLATFORM_SUPERADMIN_USERNAME`,
   `PLATFORM_SUPERADMIN_NAME`, `PLATFORM_SUPERADMIN_EMAIL` et `PLATFORM_SUPERADMIN_PASSWORD`
   (au moins 12 caractères, en mode **Sensitive**). Ces valeurs servent à créer le compte
   superadmin au premier build de production. Ne les renseignez pas dans Preview.

   **Limiteur par IP** : les limites de débit par adresse IP (mot de passe oublié, réinitialisation et formulaire public de collecte) s'appuient sur l'en-tête posé par la plateforme (`x-vercel-forwarded-for`, ou `x-real-ip`). Sur Vercel il est présent ; derrière un autre proxy, le configurer pour qu'il transmette l'adresse du client. Le formulaire public échoue fermé avec une réponse 503 si l'adresse ne peut pas être identifiée.

3. Dans MongoDB Atlas → **Network Access**, autoriser `0.0.0.0/0` (Vercel n'a pas d'IP sortante fixe sur le plan standard), ou utiliser une IP fixe via [Vercel Secure Compute](https://vercel.com/docs/secure-compute) si nécessaire.
4. Déployer. En production, le build Vercel crée le super administrateur si aucun n'existe ; les builds Preview sautent ce seed. Le compte reçoit le rôle plateforme et doit changer son mot de passe à la première connexion.
5. Le superadmin ouvre `/plateforme/entreprise` et crée le premier Admin Ops. Cette création n'est possible qu'une seule fois ; l'Admin Ops gère ensuite les autres comptes depuis `/utilisateurs`. Le guide de l'application, accessible après connexion, détaille aussi ces étapes pour le superadmin.
6. `npm run seed` reste réservé aux données de démonstration en développement. Pour créer manuellement un superadmin, définir les quatre variables `PLATFORM_SUPERADMIN_*` et `MONGODB_URI`, puis lancer `npm run seed:superadmin`. Ne jamais committer ces valeurs.

## Phase 2 — Console terrain (application en ligne)

La console terrain est accessible sur **`/terrain`** (rôle Chauffeur) et fonctionne
avec une connexion Internet. Elle peut être installée sur un appareil mobile depuis le navigateur,
mais ses pages, données et actions nécessitent un accès réseau.

### Installer depuis le navigateur

1. Ouvrir l'application en HTTPS (déploiement Vercel) dans Chrome/Edge (Android ou desktop).
2. Android : menu ⋮ → « Ajouter à l'écran d'accueil » ; desktop : icône d'installation
   dans la barre d'adresse. L'app se lance alors en plein écran (`display: standalone`).
3. Le manifest est servi par `src/app/manifest.ts`. L'installation ne rend pas l'application
   disponible sans connexion Internet ; aucune donnée ni action n'est conservée localement pour une
   synchronisation ultérieure.
4. Les anciennes versions pouvaient enregistrer un service worker et des caches locaux ;
   l'application les désenregistre et les supprime lors de l'ouverture après mise à jour.

### Connexion requise

La consultation et les actions terrain (statuts, photos, signatures, quantités, rapports et
traçabilité) communiquent directement avec le serveur. En cas de panne réseau, l'interface
signale l'échec et permet de réessayer ; elle ne confirme pas une action non reçue par le serveur.
Il n'y a ni mode hors ligne, ni cache applicatif des données, ni file locale de mutations.

### Workflow Chauffeur et Rapport Digital

- **Workflow étape par étape** : boutons contextuels selon l'avancement (`En route`, `Arrivé sur site / En cours`, `Renseigner le rapport & signer`).
- **Signature & Photos** : capture sur écran tactile ou souris, validation des déchets collectés et observations.
- **Rapport d'intervention PDF** : génération et téléchargement direct côté chauffeur ou backoffice (`GET /api/operations/[id]/rapport`).
- **Envoi automatique par e-mail** : génération du PDF joint et expédition SMTP au client (`POST /api/operations/[id]/rapport`), avec transition automatique vers le statut `Rapportée`.

## Phase 3 — Traçabilité des déchets

Chaque opération peut contenir plusieurs lignes de traçabilité, une par flux de déchets. Une ligne
enregistre l'identifiant de suivi externe (unique, insensible à la casse), le type de déchet, la
quantité et son unité (`Litres`, `Kg`, `M3` ou `Bacs`), ainsi que le traitement prévu ou réalisé.
L'enregistrement conserve l'acteur de création et de dernière modification, ainsi que les dates
de création et de mise à jour.

- **Saisie et correction** : admin, dispatcher et chauffeur affecté à l'opération, depuis la fiche
  d'intervention ou la console `/terrain`.
- **Intégrité** : une ligne peut être corrigée mais ne peut pas être supprimée ; l'identifiant
  externe, l'auteur de création et l'auteur de la dernière modification sont conservés.
- **Consultation** : la page `/tracabilite` donne à l'équipe interne une vue filtrable par texte ;
  le rôle lecture seule peut consulter, sans modifier.
- **API** : `GET /api/tracabilite` pour la vue interne ; `GET/POST /api/operations/[id]/tracabilite`
  et `PUT /api/operations/[id]/tracabilite/[traceId]` pour les opérations.
- **Sécurité** : accès chauffeur limité aux opérations de son équipe ; les comptes client n'ont
  pas accès aux fiches de traçabilité ; les identifiants en doublon sont refusés.
- **Connexion** : la saisie et la consultation nécessitent une connexion Internet, comme le reste
  de l'application ; aucune mise en file locale n'est effectuée en cas de coupure.

Le backend de `tracabilite` suit les conventions du projet (domain/application/HTTP/Mongoose) et
expose son API via des ré-exports `src/app/api`. Le frontend de cette fonctionnalité est isolé dans
`src/frontend/tracabilite`, avec une vue de synthèse et un formulaire réutilisé par les opérations
et la console terrain.

## Phase 4 — Espace client et demandes en ligne

### Formulaire public

`/demande` permet à une entreprise sans compte de transmettre ses coordonnées, son site et la date
souhaitée. La soumission est validée côté serveur, limitée à 16 Ko, protégée par un débit de
5 soumissions par adresse IP et par heure et de 3 par adresse e-mail et par heure. Une demande est
stockée séparément, au statut interne `en_attente` : elle ne crée ni client, ni site, ni opération
avant vérification par le dispatch. La confirmation s'affiche dans le navigateur et les comptes
Admin/Dispatcher reçoivent un e-mail interne. Le contact public ne reçoit pas d'e-mail avant la qualification de sa demande.

### Qualification des demandes

Les rôles **Admin** et **Dispatcher** traitent la file `/demandes`. Ils vérifient la demande,
choisissent le client et un site déjà rattaché à ce client, puis la convertissent en opération au
statut `Demande`, ou la refusent avec un motif facultatif. La conversion est protégée contre les
conversions concurrentes et idempotente ; les demandes refusées restent conservées dans l'historique.

### Portail authentifié

Un compte **Client** se connecte via `/login` et doit être rattaché à un `clientId` par un
administrateur. `/espace-client` affiche son tableau de bord, `/espace-client/operations` liste ses
opérations et `/espace-client/nouvelle-demande` soumet une demande liée à l'un de ses sites. Le
périmètre client est imposé par la session côté serveur, jamais par un identifiant fourni par le
navigateur. Les réponses du portail excluent les équipes, véhicules, notes internes, signatures et
historiques d'employés. Les demandes publiques non vérifiées ne sont pas visibles par les clients.

### API

- `POST /api/demandes/publiques` : soumission publique protégée par validation et limite de débit.
- `GET /api/demandes` : file interne, Admin/Dispatcher uniquement.
- `POST /api/demandes/[id]/convertir` et `/refuser` : qualification et traitement interne.
- `GET /api/espace-client/dashboard`, `/operations` et `/sites` : données bornées au client connecté.
- `POST /api/espace-client/demandes` : création d'une opération `Demande` avec validation serveur
  du rattachement site/client.

Toutes ces pages et API nécessitent Internet, à l'exception du formulaire public qui doit
naturellement être accessible sans session. Les données ne sont ni mises en cache hors ligne ni
synchronisées en différé.

## Documentation

- [PLAN.md](./PLAN.md) — plan d'exécution
- [docs/superpowers/plans/2026-09-19-alignement-proposition-digitalisation.md](./docs/superpowers/plans/2026-09-19-alignement-proposition-digitalisation.md) — alignement avec la proposition (docs/proposition-digitalisation.pdf)
- [AGENTS.md](./AGENTS.md) — spec technique
- [docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md](./docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md) — conception de l'architecture hexagonale / « screaming » (voir « Architecture »)
- [DESIGN.md](./DESIGN.md) — design system
