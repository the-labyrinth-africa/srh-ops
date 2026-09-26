# Refactoring R3b — Domaine `comptes` : cas d'usage et adaptateurs : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrer les cas d'usage du domaine `comptes` (utilisateurs, invitation, mot de passe oublié/réinitialisation/changement, e-mail de test) vers l'architecture hexagonale, en s'appuyant sur le socle livré par R3a (`platform/{email,limiteur-debit,execution-differee,horloge,http}`). Deuxième des trois sous-plans de R3 (« sensible »). **3c (NextAuth, `Acteur`, gardes de pages/routes) reste hors périmètre** : les contrôleurs de ce sous-plan continuent d'importer `requireAuth` depuis `@/lib/api-auth` de façon transitoire, exactement comme les domaines précédents l'ont fait avec `requireInternalAuth`/`requireReferentialRead`.

**Architecture:** Domaine `src/backend/comptes/` : `domain/{utilisateur,erreurs,ports}.ts`, `application/` (cinq groupes de cas d'usage : utilisateurs, mot de passe oublié, réinitialisation, changement de mot de passe, e-mail de test), `infrastructure/{en-memoire,mongoose,email}/`, `http/` (schémas Zod, présentation, contrôleurs), `composition.ts`, `index.ts`. Les fichiers `src/app/api/{users,auth/forgot-password,auth/reset-password,auth/change-password,mail/test}/**/route.ts` deviennent des ré-exports. `Utilisateur` a une relation peuplée vers `Client`/`Equipe` (comme `Site` vers `Client` en R2) : appliquer directement la leçon de R2/R3a sur les références pendantes (branche à trois voies : peuplé / valeur brute / `null`, jamais une chaîne `"null"`).

**Tech Stack:** Next.js 16 (`src/`), TypeScript, Mongoose, bcryptjs, Zod, Vitest + mongodb-memory-server, ESLint 9.

**Spec / feuille de route:** `docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md` (ligne 99 : `comptes` — cohérence rôle ↔ client/équipe ; validité d'une session après réinitialisation ; durées de vie des jetons | utilisateurs (créer + invitation, modifier + révocation de liens, supprimer, régénérer, envoyer un lien), mot de passe oublié, réinitialisation, changement de mot de passe, e-mail de test | `UtilisateurRepository`, `JetonRepository`, `HacheurMotDePasse`, `GenerateurDeSecrets`, `EnvoiEmail`, `LimiteurDebit`, `ExecutionDifferee`, `Horloge`) ; `docs/superpowers/plans/2026-09-20-refactor-architecture-master.md` (contraintes globales, `verifier-build`, enseignements de R0-R3a) ; modèles de référence **déjà présents dans le dépôt** : `src/backend/clients-sites/**` (relation peuplée avec gestion du `null`, garde de suppression), `src/backend/platform/{email,limiteur-debit,execution-differee,horloge,http}/**` (R3a, ports déjà livrés).

## Global Constraints

- **Aucun changement de comportement** : mêmes codes HTTP, mêmes corps JSON (dont `_id`, `createdAt`, `updatedAt`, `__v`, la forme peuplée `clientId`/`equipeId: {_id, nom} | null | absent`), mêmes messages d'erreur **au mot près** (« Non authentifié », « Compte client sans périmètre attribué », `MUST_CHANGE_PASSWORD`, « Cet e-mail est déjà utilisé », « Ce nom d'utilisateur est déjà utilisé », « Lien invalide ou expiré. Demandez un nouveau lien. » avec `code: "INVALID_LINK"`, etc. — copiés verbatim dans la table « Faits vérifiés »), mêmes en-têtes (`Cache-Control: no-store` sur toute réponse portant un secret ou liée à l'authentification, `Retry-After` sur 429), même ordre des vérifications (garde d'authentification → rôle → validation → limiteur de débit → logique métier), même comportement de sécurité (réponse générique identique que le compte existe ou non pour « mot de passe oublié » ; envoi de l'e-mail après la réponse via `runAfterResponse` pour ne pas créer d'oracle temporel ; jamais de 500 explicite, toujours un 503/502 avec message générique en cas d'indisponibilité d'une dépendance, le nom de l'erreur seul est journalisé).
- Écarts connus et acceptés de R0-R3a, toujours valables : `_id` en tête d'un POST 201 ; une lecture projetée par l'entité remplace par sa valeur par défaut un champ manquant pour quelque raison que ce soit (jamais un champ omis) ; une relation peuplée absente de la base (référence pendante) doit produire un JSON `null` réel, jamais la chaîne `"null"` (branche à trois voies obligatoire, cf. le bug corrigé en R2 tâche 2).
- Les tests existants ne changent que par leurs **chemins d'import**. Aucune assertion supprimée, affaiblie ou passée en `skip`.
- À chaque commit : `npx tsc --noEmit` propre, `npm run lint` (0 erreur), `npx vitest run` tout vert (791 tests au départ).
- **Sécurité renforcée (domaine sensible)** : ne jamais journaliser un mot de passe, un jeton, un hash ou une adresse e-mail en clair dans un message d'erreur, un commentaire ou un test — seuls les noms d'erreur (`error.name`) sont journalisés, exactement comme le code actuel. Ne jamais réduire une fenêtre de limiteur de débit, un TTL de jeton ou une longueur minimale de mot de passe. Ne jamais introduire de branche qui distinguerait, dans la réponse HTTP ou le temps de réponse, un compte existant d'un compte inexistant sur les routes publiques (`forgot-password`).
- Ne jamais lire ni afficher `.env.local` ; ne jamais lancer `npm run build`, `npm run seed`, `scripts/seed-admin.ts` ni `scripts/send-test-mail.ts` ; aucun e-mail réel. Compilation Next : uniquement la commande `verifier-build` du plan maître (variables factices).
- Ne jamais stager `.agents/`, `.claude/`, `skills-lock.json`, `rapports/`, `package.json` (modification locale non liée, port du serveur de dev). Commande d'ajout : `git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!package.json'`.
- Après chaque codemod d'imports : `git diff --stat`, `git checkout -- <fichier>` pour tout fichier modifié à tort — **jamais** `git reset`. Vérifier par **grep indépendant** (pas seulement la liste d'importeurs de ce plan) qu'aucun ancien chemin ni import relatif ne survit (leçon de R3a : le codemod fait une correspondance exacte de chaîne, pas de préfixe).
- Langue : dossiers de domaine et vocabulaire métier en français, suffixes techniques en anglais.
- Branche : `refactor/r3b-comptes-cas-dusage` créée depuis `main` (`d619a4a`).

### Faits vérifiés sur le code actuel (base du plan)

**Modèle `User`** (`src/models/User.ts`) : `username` (String, requis, unique, lowercase, trim), `nom` (String, requis), `email` (String, requis, unique, lowercase, trim), `motDePasseHash` (String, requis, **jamais renvoyé** — toutes les lectures font `.select("-motDePasseHash")**), `role` (enum `admin|dispatcher|chauffeur|client|lecture`, défaut `dispatcher`), `clientId?` (ObjectId, ref `Client`), `equipeId?` (ObjectId, ref `Equipe`), `telephone?` (String, défaut `""`), `mustChangePassword?` (Boolean, défaut `false`), `passwordChangedAt?` (Date, pas de défaut), timestamps. Index sur `role`. **Toute réponse contenant un utilisateur peuple `clientId`/`equipeId`** (`.populate("clientId","nom").populate("equipeId","nom")`) — y compris les réponses de POST et PUT (contrairement à `Site` en R2, où seules les lectures étaient peuplées).

**Modèle `PasswordResetToken`** (`src/models/PasswordResetToken.ts`) : `userId` (ObjectId, ref `User`, requis, indexé), `tokenHash` (String, requis, **unique**), `purpose` (enum `reset|invitation`, requis), `expiresAt` (Date, requis), `usedAt` (Date, défaut `null`), `createdAt` seul (pas de `updatedAt`). TTL Mongo sur `expiresAt` (`expireAfterSeconds: 86400`, purge 24 h après expiration). **N'est jamais sérialisé dans une réponse HTTP** — usage entièrement interne, aucune présentation JSON n'est nécessaire pour cette entité.

| Route | Garde | Comportement exact | Codes |
|---|---|---|---|
| `GET /api/users` | `requireAuth()` puis `role === "admin"` sinon 403 « Accès réservé aux administrateurs » | Filtre optionnel `?role=`, triés `{createdAt: -1}`, peuplés | 200 |
| `POST /api/users` | `requireAuth(true)` puis `role === "admin"` | Valide (`userCreateSchema`) ; vérifie doublon email/username (409, message distinct selon lequel) ; génère un mot de passe temporaire (`generateRandomPassword(10)`, haché bcrypt coût 10) ; crée avec `mustChangePassword: true` ; émet un jeton d'invitation (72 h) **après** avoir calculé `appBaseUrl()` (si `appBaseUrl()` lève, aucun jeton n'est émis) ; tente l'envoi ; si échec d'envoi (`try/catch` autour de tout le bloc invitation), la création reste un succès — la réponse expose alors `generatedPassword` en repli ; `invitationSent` détermine le corps (`invitation: "sent"` avec `message` **ou** `invitation: "not_sent"` avec `generatedPassword` et un autre `message`) ; réponse toujours `Cache-Control: no-store` | 201 (`Cache-Control: no-store`), 400, 409 |
| `GET /api/users/[id]` | `requireAuth()` puis (`role === "admin"` OU `auth.user.id === id`) sinon 403 « Accès refusé » | Peuplé | 200, 400 (id invalide), 404 « Utilisateur non trouvé » |
| `PUT /api/users/[id]` | `requireAuth(true)` puis `role === "admin"` | Valide (`userUpdateSchema`, pas de champ mot de passe) ; `clientId`/`equipeId` : `$set` si fourni, `$unset` sinon (Mongoose ignore les clés `undefined`, il faut `$unset` explicite pour retirer un rattachement) ; si l'email change (comparaison insensible à la casse avec l'ancien), révoque tous les jetons en attente (`PasswordResetToken.deleteMany({userId, usedAt: null})`) — **après** la mise à jour réussie | 200, 400, 404 |
| `DELETE /api/users/[id]` | `requireAuth(true)` puis `role === "admin"` | Refuse de se supprimer soi-même **avant** la tentative de suppression (400 « Impossible de supprimer votre propre compte ») | 200 `{"message":"Utilisateur supprimé avec succès"}`, 400, 404 « Utilisateur non trouvé » |
| `POST /api/users/[id]/reset-password` | `requireAuth(true)` puis `role === "admin"` | Régénère un mot de passe temporaire (même génération que la création), `mustChangePassword: true`, `passwordChangedAt: new Date()` ; révoque tous les jetons en attente ; renvoie **une seule fois** `{generatedPassword}` | 200 (`Cache-Control: no-store`), 400, 404 |
| `POST /api/users/[id]/send-reset-link` | `requireAuth(true)` puis `role === "admin"` | Limiteur `consumeRateLimit("send-link", id, {limit:5, windowMs:3_600_000})` — échec du limiteur → 503 « Service momentanément indisponible... » ; limite atteinte → 429 avec `Retry-After` ; émet un jeton `reset` (30 min) et envoie ; échec d'envoi (catch large) → `{sent:false, reason}` non levé | 200 `{sent:true}` / `{sent:false,reason}` (502 si `sent:false`), 400 (id invalide), 403, 404, 429, 503 — toutes réponses `Cache-Control: no-store` |
| `POST /api/auth/forgot-password` | **aucune** (route publique) | Valide `identifier` (schéma minimal) ; double limiteur en parallèle (`forgot-ip` sur `clientIp(req)`, 10/h ; `forgot-id` sur l'identifiant en minuscules, 5/h) — échec du limiteur → réponse générique **sans échec visible** (jamais de 503 ici, contrairement aux autres routes) ; recherche + émission + envoi **après la réponse** via `runAfterResponse` (aucun oracle temporel) ; réponse **toujours identique** que le compte existe ou non | 200 (message générique, `Cache-Control: no-store`), 400 (identifiant absent), 429 |
| `POST /api/auth/reset-password` | **aucune** (route publique, token dans le corps) | Limiteur `reset-ip` sur `clientIp(req)`, 20/h, **échec fermé** (503 si le limiteur est indisponible — contrairement à `forgot-password`) ; valide `token` (≤512) et `newPassword` (6-128) ; si validation échoue sur le mot de passe, message spécifique, **le jeton n'est pas consommé** ; consomme le jeton (`purpose` doit être `reset` **ou** `invitation`) ; échec (jeton invalide/expiré/déjà utilisé/purpose non admissible) → 400 `{"error":"Lien invalide ou expiré. Demandez un nouveau lien.","code":"INVALID_LINK"}` ; succès → hash bcrypt coût 10, `mustChangePassword:false`, `passwordChangedAt:new Date()`, révoque tous les jetons en attente ; e-mail « mot de passe modifié » envoyé **seulement si `purpose === "reset"`** (jamais après activation d'une invitation), après la réponse | 200, 400, 429, 503 |
| `POST /api/auth/change-password` | `requireAuth(false, {allowMustChangePassword:true})` | Valide (`changePasswordSchema`) ; vérifie `bcrypt.compare(currentPassword, hash)` (400 « Mot de passe actuel incorrect ») ; refuse `currentPassword === newPassword` (400) ; hash bcrypt coût 10 ; **ne pose PAS `passwordChangedAt`** (un changement volontaire ne doit pas invalider la session en cours, contrairement à une réinitialisation) ; révoque les jetons en attente | 200, 400, 404 |
| `POST /api/mail/test` | `requireAuth(true)` puis `role === "admin"` | Limiteur `consumeRateLimit("mail-test", auth.user.id, {limit:5, windowMs:3_600_000})`, échec → 503 ; limite atteinte → 429 ; envoie un e-mail de test à l'adresse du compte connecté | 200/502 selon `result.ok` (jamais 503 dû au transport, seulement au limiteur), 403, 429, 503 — `Cache-Control: no-store` |

**Modules déjà isolés, à transposer (pas à réécrire) :**
- `src/lib/auth/reset-token.ts` (62 lignes) : `hashToken` (SHA-256), `issueResetToken(userId, purpose, now?)` (supprime tout jeton actif de même `purpose` **avant** d'en créer un nouveau — un seul jeton actif par utilisateur ET par finalité ; `PasswordResetToken.init()` appelé avant toute écriture), `consumeResetToken(token, now?)` (rejette un format invalide **avant** toute requête base ; `findOneAndUpdate` atomique sur `usedAt:null, expiresAt:{$gt:now}` → pose `usedAt` ; renvoie `null` si rien trouvé) — logique Mongoose, doit migrer en adaptateur (`JetonRepositoryMongoose`), pas rester une fonction libre importée par l'application.
- `src/lib/auth/account-mail.ts` (75 lignes) : `buildResetMail`/`buildInvitationMail`/`buildPasswordChangedMail` (purs, aucune I/O) + `sendResetLinkMail`/`sendInvitationMail`/`sendPasswordChangedMail` (appellent `sendMail` de `@/backend/platform/email` directement) — les générateurs de gabarits sont purs et migrent tels quels ; les trois fonctions d'envoi doivent passer par le port `EnvoiEmail` injecté plutôt que d'importer `sendMail` en dur, pour que l'application reste testable avec un faux.
- `src/lib/email.ts` (`generateRandomPassword`, 10 lignes, `crypto.randomInt`) : implémentation de `GenerateurDeSecrets`.
- `src/lib/users/scope.ts` (`findScopeError`, déjà lu en R2 — importe `@/models/Client` et `@/backend/equipes/infrastructure/mongoose/equipe.model`) : reste un module transitoire, **hors périmètre de ce sous-plan** (il sera absorbé quand `comptes` aura son propre port vers `clients-sites`/`equipes` — pas avant), mais son import de `@/models/Client` doit être corrigé par un codemod comme importeur transitoire, puisque rien ne bouge côté `Client` ici — **en réalité aucun changement n'est nécessaire** : `scope.ts` n'importe aucun des fichiers déplacés par ce sous-plan, à laisser tel quel.
- **`src/lib/api-auth.ts` : hors périmètre, ne jamais y toucher** (3c). Les contrôleurs de ce sous-plan importent `requireAuth` depuis `@/lib/api-auth` exactement comme aujourd'hui.

**Importeurs hors domaine à corriger (codemod) :** aucun composant frontend n'importe directement `@/models/User` ou `@/models/PasswordResetToken` (vérifié par grep) — seules les routes API elles-mêmes et les tests d'intégration importent ces chemins ; `src/backend/platform/base-de-donnees/enregistrement-modeles.ts` (ligne `User`, 6ᵉ position, à mettre à jour) ; `scripts/seed-admin.ts` (importe `User`, **jamais exécuté**, import à corriger à la main).

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `src/backend/comptes/domain/{utilisateur,erreurs,ports}.ts` (créer) | Types, erreurs métier, ports (`UtilisateurRepository`, `JetonRepository`, `HacheurMotDePasse`, `GenerateurDeSecrets`, `EnvoiEmail`, `LimiteurDebit`, `ExecutionDifferee`, `Horloge`) |
| `src/backend/comptes/application/**` (créer) | Cinq groupes de cas d'usage (utilisateurs, mot de passe oublié, réinitialisation, changement de mot de passe, e-mail de test) |
| `src/backend/comptes/infrastructure/mongoose/**` (créer) | `UtilisateurRepositoryMongoose`, `JetonRepositoryMongoose`, modèles déplacés |
| `src/backend/comptes/infrastructure/email/gabarits-email.ts` (créer) | Gabarits transposés depuis `account-mail.ts` |
| `src/backend/comptes/http/**` (créer) | Schémas Zod, présentation, contrôleurs (6 fichiers de route) |
| `tests/integration/comptes-caracterisation.test.ts` (créer, si besoin de compléter la couverture existante) | Filet complémentaire (la couverture existante — 1498 lignes réparties sur 9 fichiers — est déjà substantielle ; ne pas la dupliquer) |

---

### Task 1 : Domaine, ports, adaptateurs d'infrastructure

**Files:**
- Create: `src/backend/comptes/domain/{utilisateur,erreurs,ports}.ts`, `src/backend/comptes/infrastructure/mongoose/{utilisateur.repository.mongoose,utilisateur.model,jeton.repository.mongoose,jeton.model}.ts` (+ tests de contrat), `src/backend/comptes/infrastructure/email/gabarits-email.ts`, `src/backend/comptes/infrastructure/mongoose/hacheur-mot-de-passe.bcrypt.ts`, `src/backend/comptes/infrastructure/generateur-de-secrets.aleatoire.ts`
- Move: `src/models/User.ts` → `src/backend/comptes/infrastructure/mongoose/utilisateur.model.ts` ; `src/models/PasswordResetToken.ts` → `src/backend/comptes/infrastructure/mongoose/jeton.model.ts`
- Modify: `src/backend/platform/base-de-donnees/enregistrement-modeles.ts` (ligne `User`), `scripts/seed-admin.ts` (import relatif, jamais exécuté)

**Interfaces:**
- Produit :
  ```ts
  // domain/utilisateur.ts
  import type { UserRole } from "@/shared/acces/roles";

  export interface Utilisateur {
    id: string;
    username: string;
    nom: string;
    email: string;
    role: UserRole;
    /** absent si non rattaché ; `null` si la référence est pendante (client supprimé) ; peuplé sinon. */
    clientId?: { id: string; nom: string } | null;
    equipeId?: { id: string; nom: string } | null;
    telephone: string;
    mustChangePassword: boolean;
    passwordChangedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
    revision?: number;
  }

  /** Saisie d'écriture : clientId/equipeId en chaîne brute (jamais peuplés à l'écriture). */
  export interface UtilisateurSaisie {
    username: string;
    nom: string;
    email: string;
    role: UserRole;
    telephone: string;
    clientId?: string;
    equipeId?: string;
  }
  ```
  `erreurs.ts` : `UtilisateurIntrouvable` (« Utilisateur non trouvé »), `EmailDejaUtilise` (« Cet e-mail est déjà utilisé »), `UsernameDejaUtilise` (« Ce nom d'utilisateur est déjà utilisé »), `SuppressionDeSoiInterdite` (« Impossible de supprimer votre propre compte »), `LienInvalideOuExpire` (message « Lien invalide ou expiré. Demandez un nouveau lien. », propriété `code = "INVALID_LINK"`), `MotDePasseActuelIncorrect` (« Mot de passe actuel incorrect »), `NouveauMotDePasseIdentique` (« Le nouveau mot de passe doit être différent de l'ancien »).
  `ports.ts` : `UtilisateurRepository` (`lister(role?): Promise<Utilisateur[]>`, `trouverParId(id): Promise<Utilisateur|null>`, `trouverProjectionParIdentifiant(identifiant): Promise<{id,nom,email}|null>` — recherche insensible à la casse par email ou username selon la présence d'un `@`, `existeEmailOuUsername(email, username): Promise<{email:boolean; username:boolean}>`, `creer(saisie, motDePasseHash): Promise<Utilisateur>`, `modifier(id, saisie): Promise<Utilisateur|null>`, `supprimer(id): Promise<boolean>`, `changerMotDePasse(id, motDePasseHash, options:{mustChangePassword:boolean; poserPasswordChangedAt:boolean}): Promise<{id:string; nom:string; email:string}|null>`, `trouverHashMotDePasse(id): Promise<string|null>`) ; `JetonRepository` (`emettre(userId, finalite:"reset"|"invitation", maintenant): Promise<{token:string; expiresAt:Date}>`, `consommer(token, maintenant): Promise<{userId:string; finalite:"reset"|"invitation"}|null>`, `revoquerEnAttente(userId): Promise<void>`) ; `HacheurMotDePasse` (`hacher(motDePasse): Promise<string>`, `comparer(motDePasse, hash): Promise<boolean>`) ; `GenerateurDeSecrets` (`motDePasseAleatoire(longueur?): string`) ; types de fonction `EnvoiEmail`, `LimiteurDebit`, `ExecutionDifferee`, `Horloge` réutilisant directement les signatures de `@/backend/platform/{email,limiteur-debit/rate-limit,execution-differee/execution-differee,horloge/horloge}` (import de type uniquement, pas de ré-implémentation).
- Consomme : `connectDB` (`@/backend/platform/base-de-donnees/connexion`), les modules **déjà livrés par R3a** (`sendMail`, `consumeRateLimit`, `runAfterResponse`, `Horloge`/`SystemClock`), `bcryptjs`.

- [ ] **Step 0 : Branche et base de départ.** `git switch -c refactor/r3b-comptes-cas-dusage` (depuis `main`), `npx vitest run 2>&1 | grep -E "Test Files|Tests "` → 791 tests verts, `npx tsc --noEmit` propre, `npm run lint` 0 erreur.

- [ ] **Step 1 : Domaine pur** (`utilisateur.ts`, `erreurs.ts`, `ports.ts` du bloc « Interfaces » ci-dessus, complétés avec les erreurs listées).

- [ ] **Step 2 : Modèles déplacés (codemod), sans changement de schéma.**

```bash
mkdir -p src/backend/comptes/infrastructure/mongoose src/backend/comptes/infrastructure/email src/backend/comptes/domain src/backend/comptes/application src/backend/comptes/http
git mv src/models/User.ts src/backend/comptes/infrastructure/mongoose/utilisateur.model.ts
git mv src/models/PasswordResetToken.ts src/backend/comptes/infrastructure/mongoose/jeton.model.ts
node scripts/dev/remplacer-imports.mjs "@/models/User" "@/backend/comptes/infrastructure/mongoose/utilisateur.model"
node scripts/dev/remplacer-imports.mjs "@/models/PasswordResetToken" "@/backend/comptes/infrastructure/mongoose/jeton.model"
git diff --stat
```

Relire le diff, annuler toute modification coll atérale. Mettre à jour à la main `scripts/seed-admin.ts` (import relatif, jamais exécuté) et `enregistrement-modeles.ts` : remplacer `import "@/models/User";` par `import "@/backend/comptes/infrastructure/mongoose/utilisateur.model";` **à la même position** (6ᵉ ligne). **Grep indépendant obligatoire** (leçon R3a) : `grep -rn "@/models/User\b\|@/models/PasswordResetToken" src tests scripts` doit être vide après ce step, y compris les imports relatifs.

- [ ] **Step 3 : `UtilisateurRepositoryMongoose` — gestion de la relation peuplée, trois voies.**

Transposer le modèle exact de `src/backend/clients-sites/infrastructure/mongoose/site.repository.mongoose.ts` (lire ce fichier réel avant d'écrire) : `estPeuple(x)`, puis pour `clientId` et `equipeId` séparément : `estPeuple(x) ? {id: String(x._id), nom: x.nom} : x == null ? null : undefined` — **attention à la différence avec `Site`** : ici, une valeur *absente* du document (utilisateur non rattaché, ex. un `admin`) doit rester **absente** de l'entité (`clientId` non défini, pas `null`), alors qu'une valeur *présente mais pendante* (référence vers un client supprimé) doit produire `null`. Le document `.lean()` distingue les deux cas : `doc.clientId === undefined` (jamais fourni) contre `doc.clientId === null` (peuplé sans résultat). Écrire :

```ts
function versClientOuEquipe(valeur: unknown): { id: string; nom: string } | null | undefined {
  if (valeur === undefined) return undefined;
  if (estPeuple(valeur)) return { id: String(valeur._id), nom: valeur.nom };
  return null; // présent mais non résolu par .populate() : référence pendante
}
```

Écrire ensuite `UtilisateurRepositoryMongoose` (`lister`, `trouverParId`, `trouverProjectionParIdentifiant`, `existeEmailOuUsername`, `creer`, `modifier`, `supprimer`, `changerMotDePasse`, `trouverHashMotDePasse`) en transposant fidèlement la logique déjà documentée dans la table « Faits vérifiés » (routes `users/**`) : `creer` fait `.populate()` après création (comme `POST /api/users` le fait aujourd'hui) ; `modifier` applique `$set`/`$unset` exactement comme `PUT /api/users/[id]` (voir table) puis peuple le résultat ; `.select("-motDePasseHash")` sur toutes les méthodes de lecture **sauf** `trouverHashMotDePasse`.

- [ ] **Step 4 : Test de contrat `UtilisateurRepositoryMongoose` — cas de la référence pendante obligatoire.**

Sur le modèle de `src/backend/clients-sites/infrastructure/mongoose/site.repository.mongoose.test.ts` (lire ce fichier réel) : créer un utilisateur `role: "client"` rattaché à un `Client` réel, vérifier `clientId` peuplé (`{id, nom}`) ; supprimer directement le `Client` (sans passer par une route, la garde de suppression est hors périmètre de `clients-sites`) puis relire l'utilisateur → `clientId` doit être **le `null` JSON réel**, jamais la chaîne `"null"` (`toBeNull()`, pas de comparaison de chaîne) ; vérifier aussi le cas d'un utilisateur `admin` sans `clientId` ni `equipeId` → les deux champs **absents** de l'entité (`"clientId" in entite` doit être `false`). Run : `npx vitest run src/backend/comptes/infrastructure` → PASS.

- [ ] **Step 5 : `JetonRepositoryMongoose`.**

Transposer `src/lib/auth/reset-token.ts` (lu ci-dessus dans les « Faits vérifiés ») en une classe implémentant `JetonRepository` : `emettre` = `issueResetToken` (garde de type sur `userId`, `PasswordResetToken.init()`, suppression des jetons actifs de même finalité avant création, `randomBytes(32).toString("base64url")`) ; `consommer` = `consumeResetToken` (rejet du format avant toute requête, `findOneAndUpdate` atomique) ; `revoquerEnAttente(userId)` = `PasswordResetToken.deleteMany({userId, usedAt: null})` (logique déjà dupliquée trois fois dans les routes actuelles — `PUT /api/users/[id]`, `POST /api/users/[id]/reset-password`, `POST /api/auth/reset-password`, `POST /api/auth/change-password` — centralisée ici en une seule méthode). `hashToken` (SHA-256) et `TOKEN_FORMAT`/`TTL_MS` restent des détails internes du fichier, non exposés par le port.

- [ ] **Step 6 : Test de contrat `JetonRepositoryMongoose`.** Sur le modèle du test actuel de `reset-token.ts` s'il existe (`grep -rl "issueResetToken\|consumeResetToken" tests`) — sinon, écrire les cas couvrant : émission puis consommation réussie ; un seul jeton actif par (utilisateur, finalité) — émettre deux fois `reset` pour le même utilisateur, vérifier que seul le second reste consommable ; jeton `invitation` non affecté par l'émission d'un jeton `reset` du même utilisateur ; jeton expiré → `null` ; jeton déjà consommé → `null` ; format invalide → `null` sans requête base (vérifiable indirectement par l'absence d'erreur même hors connexion, ou en confiance sur la relecture du code) ; `revoquerEnAttente` ne supprime que les jetons `usedAt: null` de l'utilisateur visé.

- [ ] **Step 7 : `HacheurMotDePasseBcrypt`, `GenerateurDeSecretsAleatoire`, gabarits e-mail.**

```ts
// src/backend/comptes/infrastructure/mongoose/hacheur-mot-de-passe.bcrypt.ts
import bcrypt from "bcryptjs";
import type { HacheurMotDePasse } from "../../domain/ports";

export class HacheurMotDePasseBcrypt implements HacheurMotDePasse {
  async hacher(motDePasse: string): Promise<string> {
    return bcrypt.hash(motDePasse, 10);
  }
  async comparer(motDePasse: string, hash: string): Promise<boolean> {
    return bcrypt.compare(motDePasse, hash);
  }
}
```

```ts
// src/backend/comptes/infrastructure/generateur-de-secrets.aleatoire.ts
import crypto from "crypto";
import type { GenerateurDeSecrets } from "../domain/ports";

export class GenerateurDeSecretsAleatoire implements GenerateurDeSecrets {
  motDePasseAleatoire(longueur = 10): string {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@!";
    let password = "";
    for (let i = 0; i < longueur; i++) password += chars.charAt(crypto.randomInt(0, chars.length));
    return password;
  }
}
```

`src/backend/comptes/infrastructure/email/gabarits-email.ts` : transposer **sans modification** `buildResetMail`, `buildInvitationMail`, `buildPasswordChangedMail` depuis `src/lib/auth/account-mail.ts` (types `MailMessage` importés depuis `@/backend/platform/email/types`) ; ne pas transposer `sendResetLinkMail`/`sendInvitationMail`/`sendPasswordChangedMail` telles quelles — elles seront recomposées dans l'application (Task 2/3) comme `envoiEmail(buildXMail(...))`, `envoiEmail` étant le port injecté plutôt qu'un import direct de `sendMail`.

- [ ] **Step 8 : `composition.ts`, `index.ts`.**

```ts
// src/backend/comptes/composition.ts
// Assemblage des adaptateurs pour les cas d'usage de comptes (complété aux tâches 2-4).
import { UtilisateurRepositoryMongoose } from "./infrastructure/mongoose/utilisateur.repository.mongoose";
import { JetonRepositoryMongoose } from "./infrastructure/mongoose/jeton.repository.mongoose";
import { HacheurMotDePasseBcrypt } from "./infrastructure/mongoose/hacheur-mot-de-passe.bcrypt";
import { GenerateurDeSecretsAleatoire } from "./infrastructure/generateur-de-secrets.aleatoire";
import { sendMail } from "@/backend/platform/email";
import { consumeRateLimit } from "@/backend/platform/limiteur-debit/rate-limit";
import { runAfterResponse } from "@/backend/platform/execution-differee/execution-differee";
import { SystemClock } from "@/backend/platform/horloge/horloge";

export const utilisateurs = new UtilisateurRepositoryMongoose();
export const jetons = new JetonRepositoryMongoose();
export const hacheur = new HacheurMotDePasseBcrypt();
export const generateurDeSecrets = new GenerateurDeSecretsAleatoire();
export const envoiEmail = sendMail;
export const limiteurDebit = consumeRateLimit;
export const executionDifferee = runAfterResponse;
export const horloge = new SystemClock();
```

```ts
// src/backend/comptes/index.ts
// API publique du domaine `comptes` pour les autres domaines : aucune pour l'instant.
export {};
```

- [ ] **Step 9 : Vérifier et commit**

Run: `npx tsc --noEmit && npm run lint 2>&1 | tail -1 && npx vitest run 2>&1 | grep -E "Test Files|Tests "` — tout vert. **Ne pas encore déclarer `comptes` dans `domainesBackendMigres`** (les cas d'usage/contrôleurs n'existent pas avant les tâches 2-4 ; les routes `src/app/api/{users,auth,mail}/**` ne sont pas encore ré-écrites).

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!package.json'
git status --short | head -30
git commit -m "refactor(comptes): domaine, ports, adaptateurs Mongoose (Utilisateur, Jeton), hacheur, générateur de secrets, gabarits e-mail"
```

---

### Task 2 : Cas d'usage et contrôleurs « utilisateurs »

**Files:**
- Create: `src/backend/comptes/application/cas-d-usage-utilisateurs.ts` (+ `.test.ts`), `src/backend/comptes/http/{utilisateur.schema,presentation,utilisateurs.liste.controleur,utilisateurs.detail.controleur,utilisateurs.reset-password.controleur,utilisateurs.send-reset-link.controleur}.ts`
- Move: `src/lib/validators/user.ts` (schémas `userCreateSchema`, `userUpdateSchema` uniquement — `changePasswordSchema`/`forgotPasswordSchema` migrent à la tâche 3) → `src/backend/comptes/http/utilisateur.schema.ts`
- Modify: `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts`, `src/app/api/users/[id]/reset-password/route.ts`, `src/app/api/users/[id]/send-reset-link/route.ts`, `src/backend/comptes/composition.ts` (compléter)

**Interfaces:**
- Produit : `creerCasDUsageUtilisateurs({utilisateurs, jetons, hacheur, generateurDeSecrets, envoiEmail, limiteurDebit, horloge})` → `{lister, obtenir, creer, modifier, supprimer, regenererMotDePasse, envoyerLienDeReinitialisation}`.
- Consomme : `requireAuth` (`@/lib/api-auth`, transitoire — migre avec 3c), `guardObjectId`/`isValidObjectId` (`@/backend/platform/http/identifiants`), `appBaseUrl` (`@/backend/platform/http/url-applicative`).

- [ ] **Step 1 : Cas d'usage, TDD, transposition fidèle de la table « Faits vérifiés ».** Écrire `cas-d-usage-utilisateurs.test.ts` d'abord (faux en mémoire pour chaque port, y compris un `EnvoiEmail`/`LimiteurDebit` factices configurables pour simuler un succès/échec), couvrant au minimum : liste triée/filtrée par rôle ; `creer` génère un mot de passe, hache, crée avec `mustChangePassword:true`, émet un jeton d'invitation seulement si `appBaseUrl()` ne lève pas, bascule sur `generatedPassword` si l'envoi échoue, lève `EmailDejaUtilise`/`UsernameDejaUtilise` sur doublon (avant toute écriture) ; `modifier` applique `$set`/`$unset` (repris tel quel par le dépôt, cf. tâche 1) et révoque les jetons **seulement** si l'email change ; `supprimer` lève `SuppressionDeSoiInterdite` **avant** d'appeler le dépôt si l'id cible est celui de l'appelant (le cas d'usage doit recevoir l'id de l'appelant en paramètre) ; `regenererMotDePasse` régénère, hache, `mustChangePassword:true`, `passwordChangedAt`, révoque les jetons en attente ; `envoyerLienDeReinitialisation` consulte le limiteur (`scope:"send-link"`, `limit:5, windowMs:3_600_000`) avant toute autre action, émet un jeton `reset` (30 min — durée déjà encodée dans `JetonRepositoryMongoose`, pas reconfigurable ici), envoie via le gabarit `buildResetMail`. Puis implémenter `cas-d-usage-utilisateurs.ts` (vert).

- [ ] **Step 2 : Schéma Zod et présentation.**

`utilisateur.schema.ts` : déplacer `userCreateSchema`/`userUpdateSchema` tels quels (contenu inchangé, y compris `checkRoleScope`) ; ajouter `versSaisieCreation(entree): UtilisateurSaisie`, `versSaisieModification(entree): UtilisateurSaisie` (mappings directs, pas de coercition — vérifier au préalable, comme en R2 tâche 1, que chaque champ optionnel du schéma Zod a bien un `.default(...)` correspondant au type du domaine ; si un champ est optionnel sans défaut Zod, élargir le type du domaine plutôt que de coercer).

`presentation.ts` : `versReponseUtilisateur(utilisateur): objet` reproduisant l'ordre et les clés exacts observés aujourd'hui (`_id, username, nom, email, role, clientId?, equipeId?, telephone, mustChangePassword, passwordChangedAt?, createdAt, updatedAt, __v`), avec `clientId`/`equipeId` : absent si `undefined`, `null` si `null`, `{_id, nom}` si peuplé — même fonction de présentation que `versClientJson` en R2 (`http/presentation.ts` de `clients-sites`), transposée pour les deux champs.

- [ ] **Step 3 : Contrôleurs.** Un contrôleur par route, transposant l'ordre exact des vérifications de la table « Faits vérifiés » (garde d'authentification → contrôle du rôle admin → identifiant valide → corps validé → appel du cas d'usage → traduction des erreurs métier en codes HTTP). Les erreurs `EmailDejaUtilise`/`UsernameDejaUtilise` → 409 ; `UtilisateurIntrouvable` → 404 ; `SuppressionDeSoiInterdite` → 400. Les en-têtes `Cache-Control: no-store` sont posés explicitement sur les réponses qui en ont aujourd'hui (POST création, régénération de mot de passe, envoi de lien).

- [ ] **Step 4 : Routes.**

```ts
// src/app/api/users/route.ts
export { GET, POST } from "@/backend/comptes/http/utilisateurs.liste.controleur";
```
```ts
// src/app/api/users/[id]/route.ts
export { GET, PUT, DELETE } from "@/backend/comptes/http/utilisateurs.detail.controleur";
```
```ts
// src/app/api/users/[id]/reset-password/route.ts
export { POST } from "@/backend/comptes/http/utilisateurs.reset-password.controleur";
```
```ts
// src/app/api/users/[id]/send-reset-link/route.ts
export { POST } from "@/backend/comptes/http/utilisateurs.send-reset-link.controleur";
```

- [ ] **Step 5 : Compléter `composition.ts`** avec `casDUsageUtilisateurs = creerCasDUsageUtilisateurs({...})`.

- [ ] **Step 6 : Vérifier** — `tsc`, `lint`, `vitest` (grep indépendant des anciens chemins), `verifier-build`.

- [ ] **Step 7 : Commit**

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!package.json'
git commit -m "refactor(comptes): cas d'usage et contrôleurs utilisateurs (création, invitation, modification, suppression, régénération, envoi de lien)"
```

---

### Task 3 : Cas d'usage et contrôleurs « mot de passe »

**Files:**
- Create: `src/backend/comptes/application/{cas-d-usage-mot-de-passe-oublie,cas-d-usage-reinitialisation,cas-d-usage-changement-mot-de-passe}.ts` (+ tests), `src/backend/comptes/http/{mot-de-passe.schema,forgot-password.controleur,reset-password.controleur,change-password.controleur}.ts`
- Move: `changePasswordSchema`, `forgotPasswordSchema` de `src/lib/validators/user.ts` → `src/backend/comptes/http/mot-de-passe.schema.ts` ; le schéma local de `reset-password/route.ts` (`resetSchema`, actuellement défini dans le fichier de route lui-même, pas dans `validators/`) → même fichier
- Modify: `src/app/api/auth/{forgot-password,reset-password,change-password}/route.ts`, `src/backend/comptes/composition.ts`

**Interfaces:**
- Produit : trois fabriques distinctes (une par cas d'usage, la logique de chacune étant suffisamment différente — garde publique vs authentifiée, échec ouvert vs fermé du limiteur — pour ne pas les regrouper) : `creerCasDUsageMotDePasseOublie({utilisateurs, jetons, envoiEmail, limiteurDebit, executionDifferee, horloge})` → `{demander(identifiant, adresseIp): Promise<void>}` (ne lève jamais pour un compte inexistant — silencieux par construction, cf. transposition ci-dessous) ; `creerCasDUsageReinitialisation({utilisateurs, jetons, hacheur, envoiEmail, executionDifferee, limiteurDebit})` → `{reinitialiser(token, nouveauMotDePasse, adresseIp): Promise<void>}` ; `creerCasDUsageChangementMotDePasse({utilisateurs, jetons, hacheur})` → `{changer(utilisateurId, motDePasseActuel, nouveauMotDePasse): Promise<void>}`.
- Consomme : `clientIp` (`@/backend/platform/http/adresse-client`), `appBaseUrl`, `requireAuth`.

- [ ] **Step 1 : `mot-de-passe.schema.ts`.** Déplacer `changePasswordSchema`, `forgotPasswordSchema` (inchangés). Ajouter le schéma de réinitialisation, transposé **exactement** depuis `resetSchema` défini localement dans `src/app/api/auth/reset-password/route.ts` (token ≤512 avec messages `INVALID_LINK` personnalisés, mot de passe 6-128 avec message `PASSWORD_REQUIRED`) — ce schéma n'a jamais vécu dans `validators/`, c'est la première fois qu'il migre vers un fichier partagé ; vérifier qu'aucun autre fichier ne le réimporte avant ce déplacement (`grep -rn "resetSchema" src tests`).

- [ ] **Step 2 : Cas d'usage « mot de passe oublié », TDD.** Transposition fidèle de `POST /api/auth/forgot-password` (table « Faits vérifiés ») : la fonction `demander` ne renvoie jamais d'indication sur l'existence du compte — **le contrôleur, pas le cas d'usage, décide du corps de réponse générique** ; en cas d'échec du double limiteur, le cas d'usage doit permettre au contrôleur de distinguer « limiteur en échec → réponse générique quand même » de « limite atteinte → 429 » (deux issues différentes à exposer, par exemple via une erreur `LimiteDeDebitAtteinte(retryAfterSeconds)` levée uniquement dans le second cas, le premier cas étant avalé silencieusement par le cas d'usage lui-même comme le fait la route actuelle). La recherche + émission + envoi doivent rester encapsulées dans une fonction que le contrôleur passe à `executionDifferee` (`runAfterResponse`), pas exécutées avant la réponse.

- [ ] **Step 3 : Cas d'usage « réinitialisation », TDD.** Transposition fidèle de `POST /api/auth/reset-password` : limiteur `reset-ip` à échec **fermé** (erreur propagée, pas avalée — différence explicite avec le cas d'usage précédent, vérifier ce contraste dans les tests) ; validation du mot de passe **avant** consommation du jeton (le jeton ne doit pas être consommé si le mot de passe est invalide) ; `purpose` admissible = `reset` **ou** `invitation` ; révocation de tous les jetons en attente après succès ; e-mail « mot de passe modifié » seulement si `purpose === "reset"`, envoyé après la réponse.

- [ ] **Step 4 : Cas d'usage « changement de mot de passe », TDD.** Transposition fidèle de `POST /api/auth/change-password` : **ne pose jamais `passwordChangedAt`** (point de vigilance explicite du code actuel, à ne pas « corriger » par erreur) ; refuse `currentPassword === newPassword` ; révoque les jetons en attente après succès.

- [ ] **Step 5 : Contrôleurs.** `forgot-password.controleur.ts` : aucune garde d'authentification (route publique) ; retourne toujours le même message générique sauf 429 sur limite atteinte, 400 sur corps invalide. `reset-password.controleur.ts` : aucune garde ; 503 si le limiteur échoue, 429 si la limite est atteinte, 400 avec `code:"INVALID_LINK"` ou message de mot de passe selon la source de l'échec de validation. `change-password.controleur.ts` : `requireAuth(false, {allowMustChangePassword:true})`.

- [ ] **Step 6 : Routes.**

```ts
// src/app/api/auth/forgot-password/route.ts
export { POST } from "@/backend/comptes/http/forgot-password.controleur";
```
```ts
// src/app/api/auth/reset-password/route.ts
export { POST } from "@/backend/comptes/http/reset-password.controleur";
```
```ts
// src/app/api/auth/change-password/route.ts
export { POST } from "@/backend/comptes/http/change-password.controleur";
```

- [ ] **Step 7 : Compléter `composition.ts`** avec les trois nouvelles fabriques.

- [ ] **Step 8 : Vérifier** — `tsc`, `lint`, `vitest` (grep indépendant), `verifier-build`. Porter une attention particulière aux tests de synchronisation temporelle (`runAfterResponse`, délais du limiteur) qui pourraient être sensibles à la structure du cas d'usage — les rejouer isolément plusieurs fois si un doute apparaît.

- [ ] **Step 9 : Commit**

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!package.json'
git commit -m "refactor(comptes): cas d'usage et contrôleurs mot de passe (oublié, réinitialisation, changement)"
```

---

### Task 4 : Cas d'usage et contrôleur « e-mail de test »

**Files:**
- Create: `src/backend/comptes/application/cas-d-usage-email-de-test.ts` (+ test), `src/backend/comptes/http/mail-test.controleur.ts`
- Modify: `src/app/api/mail/test/route.ts`, `src/backend/comptes/composition.ts`, `tests/architecture/regles-de-dependance.test.ts`

**Interfaces:**
- Produit : `creerCasDUsageEmailDeTest({utilisateurs, envoiEmail, limiteurDebit})` → `{envoyer(utilisateurId): Promise<MailResult>}`.

- [ ] **Step 1 : Cas d'usage, TDD.** Transposition fidèle de `POST /api/mail/test` (table « Faits vérifiés ») : limiteur `mail-test` avant toute autre action (5/h par utilisateur), recherche de l'utilisateur (404 si absent), envoi du message exact (objet et corps identiques au texte actuel, y compris le nom de l'utilisateur interpolé).

- [ ] **Step 2 : Contrôleur.** `requireAuth(true)` puis rôle admin ; limiteur → 503 si indisponible, 429 si atteint ; 404 si utilisateur introuvable ; 200/502 selon `result.ok`.

- [ ] **Step 3 : Route.**

```ts
// src/app/api/mail/test/route.ts
export { POST } from "@/backend/comptes/http/mail-test.controleur";
```

- [ ] **Step 4 : Déclarer le domaine migré.** Dans `tests/architecture/regles-de-dependance.test.ts` : `domainesBackendMigres: ["equipes", "vehicules", "equipements", "clients-sites", "comptes"]`. **Ne pas ajouter `comptes` à `fonctionnalitesFrontendMigrees`** (aucun frontend n'est touché par ce sous-plan — R8). `npx vitest run tests/architecture` → PASS. Prouver que la règle mord : injection temporaire de `import "mongoose";` dans un fichier `application/` de `comptes`, constater l'échec R2, annuler.

- [ ] **Step 5 : Vérifier** — `tsc`, `lint`, `vitest` (grep indépendant), `verifier-build`.

- [ ] **Step 6 : Commit**

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!package.json'
git commit -m "refactor(comptes): cas d'usage et contrôleur e-mail de test ; domaine comptes déclaré migré"
```

---

### Task 5 : Documentation, statuts et revue du sous-jalon

**Files:** `README.md`, `docs/superpowers/plans/2026-09-20-refactor-architecture-master.md`, `docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md`

- [ ] **Step 1 : README.** Ajouter `comptes` à la liste des domaines backend migrés ; vérifier que chaque chemin cité existe. Ne rien changer côté frontend (R8).
- [ ] **Step 2 : Statuts.** Plan maître : la ligne R3 passe de « En cours (3a réalisé ; 3b, 3c à venir) » à **« En cours (3a, 3b réalisés ; 3c à venir) »**. Ajouter dans « Enseignements » : « R3b : `Utilisateur` a deux champs peuplés (`clientId`, `equipeId`), chacun avec trois états distincts (absent / peuplé / `null` sur référence pendante) — la fonction de correspondance doit les distinguer explicitement, l'un des deux ne suffit pas à généraliser à l'autre par copier-coller sans vérification ; les cas d'usage sensibles au temps de réponse (`forgot-password`) et à l'échec ouvert/fermé d'un limiteur (`reset-password` vs `forgot-password`, volontairement différents) doivent être transposés avec un test qui vérifie explicitement le contraste, pas seulement chaque cas d'usage isolément. »
- [ ] **Step 3 : Vérification complète** : `npx tsc --noEmit && npm run lint && npx vitest run`, puis `verifier-build`.
- [ ] **Step 4 : Non-régression ciblée** (à consigner dans le rapport) : `git diff main --stat -- tests/unit tests/integration` — les tests existants ne changent que par des chemins d'import ; comparer les réponses JSON avant/après (méthode R0-R3a) sur au moins : liste/détail utilisateurs (avec relation peuplée et cas de référence pendante), création avec/sans envoi réussi, modification (avec et sans changement d'email), suppression (y compris auto-suppression refusée), régénération de mot de passe, envoi de lien (429/503/200), mot de passe oublié (réponse générique identique compte existant/inexistant), réinitialisation (200/400 les deux causes/429/503), changement de mot de passe (200/400 les deux causes), e-mail de test (200/502/429/503), sans session (401), rôle non admin (403) sur toutes les routes qui l'exigent.
- [ ] **Step 5 : Commit**

```bash
git add README.md docs/superpowers
git commit -m "docs: statuts du sous-jalon R3b (cas d'usage et adaptateurs de comptes)"
```

- [ ] **Step 6 : Revue du jalon** — **effectuée par le contrôleur** (revue finale de branche complète, modèle le plus capable ; ne pas la dispatcher comme tâche), comme pour R1, R2 et R3a. Critères : aucun changement de comportement sur les 11 routes ; contraste préservé entre `forgot-password` (échec du limiteur avalé) et `reset-password` (échec du limiteur propagé en 503) ; `passwordChangedAt` jamais posé par un changement volontaire ; un seul jeton actif par (utilisateur, finalité) ; révocation des jetons en attente déclenchée aux quatre points exacts où elle l'est aujourd'hui (email changé, régénération admin, réinitialisation, changement volontaire) — **jamais un cinquième**, ni un des quatre manquant ; `passwordChangedAt`/mots de passe/jetons jamais journalisés en clair ; aucun import résiduel vers `@/models/User`, `@/models/PasswordResetToken`, `@/lib/validators/user`, `@/lib/auth/{reset-token,account-mail}`, `@/lib/email`, `@/lib/api-auth` **inchangé et toujours transitoire** ; `enregistrement-modeles.ts` dans le même ordre ; `package.json` absent de tous les commits ; CI verte sur clone propre. **Domaine sensible : vérifier explicitement qu'aucun test n'assert sur un mot de passe, un jeton ou un hash en clair dans un message d'échec de test, et que la revue de sécurité couvre les quatre points de révocation de jetons un par un.**

---

## Auto-relecture

- **Couverture de la spec (sous-jalon 3b) :** domaine/ports/adaptateurs (tâche 1) ; utilisateurs — CRUD, invitation, régénération, envoi de lien (tâche 2) ; mot de passe — oublié, réinitialisation, changement (tâche 3) ; e-mail de test (tâche 4) ; documentation et revue (tâche 5). NextAuth/`Acteur`/gardes (3c) et frontend (R8) explicitement hors périmètre.
- **Cohérence des noms :** `Utilisateur/UtilisateurSaisie/UtilisateurRepository/UtilisateurIntrouvable/EmailDejaUtilise/UsernameDejaUtilise/SuppressionDeSoiInterdite/creerCasDUsageUtilisateurs` (tâche 1-2) ; `JetonRepository/LienInvalideOuExpire/creerCasDUsageMotDePasseOublie/creerCasDUsageReinitialisation/creerCasDUsageChangementMotDePasse/MotDePasseActuelIncorrect/NouveauMotDePasseIdentique` (tâche 1/3) ; `creerCasDUsageEmailDeTest` (tâche 4) — tous définis avant leur premier usage, jamais renommés ensuite.
- **Points de vigilance :** (1) `clientId`/`equipeId` de `Utilisateur` ont trois états (absent/peuplé/`null`), pas deux comme `Site.clientId` en R2 — ne pas réutiliser `versClientJson` de R2 sans l'adapter à l'état « absent » ; (2) `forgot-password` avale l'échec du limiteur (réponse générique quand même), `reset-password` le propage en 503 — contraste **volontaire**, à tester explicitement, pas à harmoniser ; (3) `passwordChangedAt` n'est posé que par une réinitialisation (jeton) ou une régénération admin, **jamais** par un changement volontaire — un cas d'usage qui le poserait par erreur invaliderait la session de l'utilisateur qui vient de s'authentifier ; (4) la révocation des jetons en attente a exactement quatre déclencheurs dans le code actuel (email changé en PUT, régénération admin, réinitialisation réussie, changement volontaire réussi) — le centraliser dans `JetonRepository.revoquerEnAttente` ne doit ni en perdre un, ni en ajouter un cinquième ; (5) `@/lib/api-auth` ne migre pas dans ce sous-plan (3c) — tous les contrôleurs y importent `requireAuth` exactement comme les domaines précédents l'ont fait ; (6) `package.json` ne doit jamais être staged (leçon R2/R3a) — chaque commande `git add` de ce plan l'exclut explicitement.
