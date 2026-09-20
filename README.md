# SRH Ops — Module 1 Planification des Collectes

Plateforme back-office de planification et suivi des opérations de collecte SRH.

## Stack

- Next.js 16 (App Router) + TypeScript
- MongoDB Atlas + Mongoose
- NextAuth.js (credentials + rôles)
- Tailwind CSS v4 (design system Industrial Integrity)
- FullCalendar (planning)

## Architecture

Tout le code applicatif vit sous `src/` (les dossiers `scripts/`, `public/`, `tests/`, `docs/` et `sketch/` restent à la racine, ainsi que `next.config.ts`). Le middleware d'authentification est `src/middleware.ts` (export par défaut explicite, exigé par Next 16).

- `src/backend/<domaine>/` : un domaine métier par dossier, en architecture hexagonale. `src/backend/platform/` regroupe les briques techniques partagées (connexion MongoDB, identifiants Mongo).
- `src/frontend/<fonctionnalité>/` : une fonctionnalité métier par dossier (« screaming »), plus `src/frontend/design-system/` (composants génériques).
- `src/shared/` : types, rôles, permissions et règles pures utilisables des deux côtés (aucune dépendance technique).
- `src/app/` : couche de composition Next (pages et routes). Les `route.ts` ne font que ré-exporter les contrôleurs du domaine.

Un domaine backend contient `domain/` (entités, erreurs métier, ports), `application/` (cas d'usage), `infrastructure/` (adaptateurs Mongoose et faux en mémoire), `http/` (contrôleurs, schémas Zod, présentation JSON), `composition.ts` (assemblage) et `index.ts` (seule API visible des autres domaines).

Règles de dépendance R1 à R5, vérifiées par `tests/architecture/regles-de-dependance.test.ts` (et, pour les plus courantes, par ESLint) ; R6 décrit la couche de composition `src/app/**`, qui n'est pas encore couverte par le vérificateur.

- **R1** : `domain/` n'importe que `shared/` et lui-même.
- **R2** : `application/` n'importe que `domain/`, `shared/` et des ports ; jamais mongoose, next, next-auth, nodemailer, bcryptjs, jspdf ni exceljs.
- **R3** : `infrastructure/` et `http/` importent `application/`, `domain/`, `shared/`, `platform/` ; `http/` n'atteint `infrastructure/` que via `composition.ts`.
- **R4** : `src/frontend/**` n'importe rien de `src/backend/**` (ni mongoose, ni les modèles) ; seulement `shared/` et le `design-system` ; les imports vers les dossiers hérités y restent tolérés jusqu'à R9.
- **R5** : un domaine n'en importe un autre que par son `index.ts`.
- **R6** : `src/app/**` compose : elle peut importer `frontend/*` et les contrôleurs ou `index.ts` des domaines.

Ajouter un cas d'usage : déclarer le port dans `domain/ports.ts` ; écrire le cas d'usage dans `application/` avec son test sur le faux en mémoire (`infrastructure/en-memoire/`) ; implémenter l'adaptateur Mongoose (`infrastructure/mongoose/`) ; brancher le tout dans `composition.ts` ; écrire le contrôleur dans `http/` ; enfin ré-exporter le gestionnaire depuis le `route.ts` concerné (exemple : `src/app/api/equipes/route.ts`).

État de la migration : le domaine `equipes` (backend `src/backend/equipes`, frontend `src/frontend/equipes`) est migré et sert de modèle. Les autres domaines restent dans les dossiers hérités `src/lib`, `src/models`, `src/components` et `src/hooks` pendant la transition (jalons R1 à R9 de `docs/superpowers/plans/2026-09-20-refactor-architecture-master.md`) ; le test d'architecture ne s'applique aux règles fines qu'aux domaines déjà migrés.

Vérifier la compilation Next sans toucher à la vraie base (variables factices, jamais l'URI réelle) :

```bash
MONGODB_URI="mongodb://127.0.0.1:9/inexistant" NEXTAUTH_SECRET="verification-build" \
NEXTAUTH_URL="http://localhost:3000" NEXT_TELEMETRY_DISABLED=1 npx next build
```

### Notes de migration (écarts connus et voulus du pilote `equipes`)

- La réponse JSON du `POST /api/equipes` (201) liste `_id` en premier ; les clés et les valeurs sont celles d'avant.
- Les lectures « lean » passent par l'entité : un champ absent du schéma (écrit hors Mongoose) n'est plus renvoyé.

## Démarrage

```bash
npm install
cp .env.local.example .env.local   # ou utiliser .env.local existant
npm run seed                       # admin@srh.com / admin123
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000)

## Variables d'environnement

```env
MONGODB_URI=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
# E-mail (SMTP) : voir la section « E-mail (SMTP) »
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM=
```

## Comptes seed

| Email | Mot de passe | Rôle |
|-------|--------------|------|
| admin@srh.com | admin123 | admin |
| dispatcher@srh.com | dispatch123 | dispatcher |

## Rôles et accès

Cinq rôles existent : `admin`, `dispatcher`, `lecture`, `chauffeur`, `client`. L'accès aux
pages est décrit par une matrice unique, `src/shared/acces/acces-pages.ts`, qui alimente la protection
des pages serveur (`src/lib/page-auth.ts`), le menu (`src/lib/nav.ts`) et les tests. Un chemin absent
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

| Variable | Rôle | Valeur pour SRH |
|---|---|---|
| `SMTP_HOST` | serveur SMTP | `mail.thelabyrinth.africa` |
| `SMTP_PORT` | port (465 par défaut) | `465` (SSL) ou `587` (STARTTLS) |
| `SMTP_SECURE` | `true` = SSL dès la connexion ; `false` = STARTTLS ; absent = déduit du port (`true` pour 465) | `true` avec 465, `false` avec 587 |
| `SMTP_USER` | boîte d'authentification | `contact@thelabyrinth.africa` |
| `SMTP_PASSWORD` | mot de passe de cette boîte | **secret**, voir ci-dessous |
| `MAIL_FROM` | expéditeur affiché | `"SRH <contact@thelabyrinth.africa>"` (par défaut : `SRH <SMTP_USER>`) |
| `NEXTAUTH_URL` | URL publique servant à construire les liens des e-mails | voir ci-dessous |

**Où renseigner le mot de passe SMTP** : uniquement dans `.env.local` en local (fichier ignoré
par Git), et sur Vercel dans **Settings → Environment Variables** avec le mode **Sensitive**,
pour les environnements **Production** et **Preview**. Ne jamais le committer ni le coller
dans un ticket ou une conversation.

**`NEXTAUTH_URL`** : les liens d'invitation et de réinitialisation sont construits à partir de
cette variable. En production, elle doit être l'URL publique en `https://` (par exemple
`https://<projet>.vercel.app` ou le domaine SRH) ; hors `https://`, aucun lien n'est émis en
production (l'envoi est alors traité comme un échec). L'URL est vérifiée avant l'émission du jeton : si elle est invalide, aucun jeton n'est créé (les liens déjà en attente restent intacts) et la réponse de « Mot de passe oublié » reste générique. En local, `http://localhost:3000` convient.

**Tester l'envoi** :

- en ligne de commande, sans base de données (lit `.env.local`) :
  `npx tsx scripts/send-test-mail.ts adresse@exemple.com` ;
- depuis l'application, en tant qu'administrateur : page « Mon Compte & Sécurité » (`/profil`),
  bouton « Envoyer un e-mail de test à mon adresse » (limité à 5 par heure).

Le script refuse de s'exécuter avec le transport mémoire (`MAIL_TRANSPORT=memory` ou `NODE_ENV=test`) : il affiche « Transport mémoire actif : aucun e-mail n'est réellement envoyé. » et se termine avec le code 1, au lieu d'annoncer un envoi qui n'a pas eu lieu.

**Délivrabilité** : l'expéditeur (`MAIL_FROM`) doit correspondre à la boîte authentifiée
(`SMTP_USER`). Vérifier chez l'hébergeur de messagerie que les enregistrements SPF et DKIM du
domaine `thelabyrinth.africa` sont en place, faute de quoi les messages risquent de finir en
courrier indésirable.

**En cas d'échec d'envoi** (SMTP absent, mal configuré ou en panne) :

- création d'un compte : le compte est créé quand même ; la réponse contient
  `invitation: "not_sent"` et le mot de passe temporaire, affiché une seule fois à
  l'administrateur pour qu'il le transmette (repli) ;
- action « Envoyer un lien de réinitialisation » : réponse 502, rien n'est envoyé ;
- « Mot de passe oublié » : la réponse générique est inchangée (aucune information sur le
  compte) et aucun e-mail ne part ; l'utilisateur doit s'adresser à un administrateur ;
- les journaux ne contiennent ni corps, ni lien, ni jeton, ni mot de passe, ni adresse
  e-mail : seuls l'objet du message et le nom de l'erreur sont tracés.

**Purge et durée de vie des jetons** : les documents de la collection `passwordresettokens`
sont supprimés automatiquement 24 h après leur expiration (index TTL sur `expiresAt`). Changer
cette durée impose de supprimer d'abord l'index TTL existant dans MongoDB (par exemple
`db.passwordresettokens.dropIndex("expiresAt_1")`) : sinon Mongoose refuse, à l'initialisation,
de créer l'index modifié car il entre en conflit avec l'existant. (La durée de validité des
liens elle-même, 30 min / 72 h, est vérifiée dans le code, pas par cet index.)

### Actualisation du jeton de session

Le jeton de session (JWT) est relu en base au plus toutes les 5 minutes
(`REFRESH_INTERVAL_MS` dans `src/lib/auth-refresh.ts`) : un changement de rôle ou de
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
   | `NEXTAUTH_URL` | URL publique du déploiement, ex. `https://<projet>.vercel.app` (ne pas laisser `http://localhost:3000`) |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `MAIL_FROM` | configuration SMTP (voir « E-mail (SMTP) ») |
   | `SMTP_PASSWORD` | mot de passe de la boîte SMTP, en mode **Sensitive** |

   **Limiteur par IP** : les limites de débit par adresse IP (mot de passe oublié, réinitialisation) s'appuient sur l'en-tête posé par la plateforme (`x-vercel-forwarded-for`, ou `x-real-ip`). Sur Vercel il est présent ; derrière un autre proxy, le configurer pour qu'il transmette l'adresse du client, faute de quoi tous les clients partagent un seul seau (« unknown ») et la limite devient globale.

3. Dans MongoDB Atlas → **Network Access**, autoriser `0.0.0.0/0` (Vercel n'a pas d'IP sortante fixe sur le plan standard), ou utiliser une IP fixe via [Vercel Secure Compute](https://vercel.com/docs/secure-compute) si nécessaire.
4. Déployer. Le build Vercel n'alimente plus la base par défaut : le seed au build n'a lieu que si `SEED_ON_BUILD=true` (à définir temporairement pour le premier déploiement SRH, puis à retirer). `npm run seed` lancé à la main seed toujours ; il ignore l'étape si les deux comptes de base existent déjà.
5. Le seed utilise `MONGODB_URI` fourni par Vercel. Pour l'exécuter manuellement, définir cette variable dans l'environnement avant de lancer `npm run seed`, plutôt que de committer des identifiants.

## Phase 2 — Console terrain (PWA) — livraison partielle, PWA désactivée

La console terrain est accessible sur **`/terrain`** (rôle Chauffeur) et fonctionne
comme une page web normale. Elle est prévue pour être installée comme PWA et pour
fonctionner avec une connexion instable, mais **la PWA est désactivée par défaut**
tant que les défauts de l'outbox et du service worker ne sont pas corrigés : voir
« Limites connues » ci-dessous.

### Activer / désactiver la PWA

Le service worker n'est enregistré que si `NEXT_PUBLIC_ENABLE_PWA="true"`
(cf. `.env.local.example`). Par défaut la variable est absente : l'application
désinstalle alors tout service worker déjà enregistré et vide les caches
`srh-ops-*` des postes qui ont visité une version précédente.

### Installer depuis le navigateur (une fois la PWA réactivée)

1. Ouvrir l'application en HTTPS (déploiement Vercel) dans Chrome/Edge (Android ou desktop).
2. Android : menu ⋮ → « Ajouter à l'écran d'accueil » ; desktop : icône d'installation
   dans la barre d'adresse. L'app se lance alors en plein écran (`display: standalone`).
3. Le manifest est servi par `src/app/manifest.ts`, le service worker par `public/sw.js`.

### Comportement hors-ligne (outbox)

Les actions saisies sur `/terrain` (changement de statut, photos) sont mises en file dans
IndexedDB (`src/lib/offline/outbox.ts`) puis rejouées dans l'ordre (FIFO) au retour du réseau
(`src/hooks/useOfflineSync.ts`). Une action qui échoue reste en file et est retentée au
passage suivant.

### Limites connues (la PWA reste désactivée tant qu'elles ne sont pas traitées)

L'installabilité et le mode hors-ligne n'ont pas été validés de bout en bout. Le
service worker n'est donc pas enregistré par défaut (`NEXT_PUBLIC_ENABLE_PWA`).
Défauts identifiés et non encore corrigés :

- **Outbox** : les photos sont envoyées sous la forme `{ photos }` alors que l'API attend
  `{ photo }` (réponse 400) ; un `fetch` est exécuté à l'intérieur d'une transaction
  IndexedDB (la transaction peut se fermer avant la fin de la requête).
- **Service worker** : les pages authentifiées peuvent être mises en cache sous `/`, les
  requêtes RSC sont servies en cache-first (contenu périmé), et le précache échoue sur
  une redirection.
- **Stockage** : photos et signature sont conservées en base64 dans le document
  `Operation` (limite Mongo de 16 Mo par document). Les photos sont désormais
  réduites côté navigateur et plafonnées à 2 Mo l'unité / 8 Mo par opération, mais
  un stockage objet reste à mettre en place.
- **Rapport** : l'envoi du rapport d'intervention par e-mail au client n'existe pas
  encore ; le PDF est régénéré à la demande et n'est plus stocké dans l'opération.

La PWA reste désactivée pour les utilisateurs terrain tant que ces points ne sont
pas traités (Lot « Phase 2 — finition » du plan d'alignement).

## Documentation

- [PLAN.md](./PLAN.md) — plan d'exécution
- [docs/superpowers/plans/2026-09-19-alignement-proposition-digitalisation.md](./docs/superpowers/plans/2026-09-19-alignement-proposition-digitalisation.md) — alignement avec la proposition (docs/proposition-digitalisation.pdf)
- [AGENTS.md](./AGENTS.md) — spec technique
- [docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md](./docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md) — conception de l'architecture hexagonale / « screaming » (voir « Architecture »)
- [DESIGN.md](./DESIGN.md) — design system
