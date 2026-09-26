# Refactoring R3c — Domaine `comptes` : identité NextAuth, `Acteur`, gardes de pages et de routes : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Terminer le jalon R3 (« sensible ») en migrant l'identité (NextAuth, rafraîchissement de session) et les gardes (routes, pages) dans `src/backend/comptes/`, puis en faisant cesser **tous** les domaines déjà migrés d'importer `@/lib/api-auth`/`@/lib/page-auth` — ces deux fichiers, et les trois modules déjà orphelins depuis R3b, sont supprimés à la fin de ce sous-plan. C'est le troisième et dernier sous-plan de R3 : à son terme, le plan maître passe R3 en « Réalisé ».

**Architecture:** `comptes` gagne `domain/session.ts` (règle pure de validité), `infrastructure/next-auth/` (configuration NextAuth, rafraîchissement de jeton), `http/{acteur,garde-pages}.ts` (les gardes, aujourd'hui dans `@/lib/api-auth` et `@/lib/page-auth`). **Portée large et mécanique, pas seulement `comptes`** : 43 fichiers ailleurs dans le dépôt (19 contrôleurs de domaines déjà hexagonaux, 9 routes `src/app/api/**` pas encore migrées, 15 pages `src/app/(dashboard)/**`) importent aujourd'hui `@/lib/api-auth`/`@/lib/page-auth` — supprimer ces deux fichiers exige de tous les recodemoder vers `@/backend/comptes`, qu'ils appartiennent ou non à un domaine déjà hexagonal. Aucune de ces fonctions n'est renommée (mêmes noms qu'aujourd'hui : `requireAuth`, `requireInternalAuth`, `requireReferentialRead`, `requireTerrainWrite`, `isWithinClientScope`, `isWithinTeamScope`, `chauffeurWithoutTeamError`, `extractId`, `TEAM_SCOPE_ERROR`, `requirePageAccess`).

**Tech Stack:** Next.js 16, NextAuth v4, TypeScript, Mongoose, bcryptjs, Vitest + mongodb-memory-server, ESLint 9.

**Spec / feuille de route:** `docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md` (« Exception assumée : le domaine `comptes` possède l'identité (NextAuth, session → `Acteur`). Les contrôleurs des autres domaines obtiennent l'`Acteur` via `comptes/index.ts` » ; table de correspondance : `lib/api-auth.ts`/`lib/permissions.ts`/`lib/page-access.ts` → `shared/acces` (déjà fait) + `backend/comptes/http/acteur.ts` ; `lib/page-auth.ts` → `backend/comptes/http/garde-pages.ts` ; `lib/auth.ts`/`lib/auth-refresh.ts` → `backend/comptes/infrastructure/next-auth/` + règle pure dans `domain/`) ; `docs/superpowers/plans/2026-09-20-refactor-architecture-master.md` (contraintes globales, `verifier-build`, enseignements R0-R3b) ; modèles de référence déjà présents : `src/backend/comptes/**` (R3a/R3b), `src/shared/acces/acteur.ts` (type `Acteur` déjà défini, actuellement non consommé), `src/shared/acces/{permissions,acces-pages,roles}.ts` (déjà `shared`, ne bougent pas).

## Global Constraints

- **Aucun changement de comportement** : mêmes codes HTTP, mêmes redirections de page, mêmes messages d'erreur, même contenu et durée de vie du jeton JWT (`id`, `username`, `role`, `clientId?`, `equipeId?`, `mustChangePassword?`, `invalid?`, `refreshedAt?`, `issuedAt?`), même logique de rafraîchissement (intervalle de 5 minutes, invalidation par `passwordChangedAt` postérieur à `issuedAt`, invalidation si le compte a disparu), même matrice d'accès aux pages (`canAccessPath`, inchangée, déjà dans `shared/`).
- Les tests existants ne changent que par leurs **chemins d'import**. Aucune assertion supprimée, affaiblie ou passée en `skip`.
- À chaque commit : `npx tsc --noEmit` propre, `npm run lint` (0 erreur), `npx vitest run` tout vert (875 tests au départ).
- **Sécurité renforcée (domaine sensible, dernier sous-plan)** : jamais de mot de passe/jeton/secret en clair dans un log ou un commentaire ; ne jamais affaiblir la comparaison `bcrypt.compare` ; ne jamais modifier la logique d'invalidation de session (`passwordChangedAt`/`issuedAt`) sans test explicite ; le middleware (`src/middleware.ts`) ne doit jamais laisser passer une requête vers une page protégée sans jeton valide.
- Ne jamais lire ni afficher `.env.local` ; ne jamais lancer `npm run build`, `npm run seed`, `scripts/seed-admin.ts` ni `scripts/send-test-mail.ts` ; aucun e-mail réel. Compilation Next : uniquement `verifier-build` (variables factices, plan maître).
- Ne jamais stager `.agents/`, `.claude/`, `skills-lock.json`, `rapports/`, `package.json`. Commande d'ajout : `git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!package.json'`.
- Après chaque codemod : `git diff --stat`, `git checkout -- <fichier>` pour tout fichier modifié à tort — **jamais** `git reset`. **Grep indépendant obligatoire** après chaque passage (leçon R3a/R3b : le script de codemod fait une correspondance exacte de chaîne, pas de préfixe ; vérifier aussi les imports relatifs).
- Langue : dossiers de domaine et vocabulaire métier en français, suffixes techniques en anglais ; les noms de fonctions déjà établis (`requireAuth`, etc.) ne sont jamais renommés.
- Branche : `refactor/r3c-comptes-identite-gardes` créée depuis `main` (`51f2e61`).

### Faits vérifiés sur le code actuel (base du plan)

**`src/lib/auth.ts`** (`authOptions`, 133 lignes) : `CredentialsProvider` (recherche par email si l'identifiant contient `@`, sinon par username, toutes deux en minuscules ; `bcrypt.compare` ; retourne `null` sans détail si l'identifiant ou le mot de passe sont absents/invalides — pas de distinction observable) ; `session: {strategy: "jwt"}` ; `pages: {signIn: "/login"}` ; callback `jwt` : à la connexion (`user` présent), pose `id/username/role/clientId/equipeId/mustChangePassword` **et** `refreshedAt`/`issuedAt` au même instant (`issuedAt` n'est plus jamais réécrit ensuite) ; sinon, relit la base si `trigger === "update"` **ou** `token.mustChangePassword` **ou** `needsRefresh(token)` ; callback `session` : si `token.invalid`, renvoie `{...session, user: undefined}` (session sans utilisateur → refusée partout) ; sinon recopie les champs du jeton vers `session.user`.

**`src/lib/auth-refresh.ts`** (86 lignes selon le test associé, fichier source 62 lignes) : `REFRESH_INTERVAL_MS = 5 * 60 * 1000` ; `needsRefresh(token, now?)` → `!token.refreshedAt || now - token.refreshedAt > REFRESH_INTERVAL_MS` ; `refreshTokenFromDb(token)` : relit `User.findById(token.id).select("role clientId equipeId mustChangePassword passwordChangedAt")` ; compte absent → `{...token, invalid:true, refreshedAt:Date.now()}` ; `passwordChangedAt` postérieur à `issuedAt` (jeton sans `issuedAt` = antérieur, donc `0`) → `{...token, invalid:true, refreshedAt:Date.now()}` ; sinon → `{...token, invalid:false, role, clientId?, equipeId?, mustChangePassword, refreshedAt:Date.now()}`. **Règle pure candidate pour `domain/session.ts`** : la comparaison `passwordChangedAt`/`issuedAt` (aucune E/S, juste une comparaison de dates) — le reste (`User.findById`) reste dans l'adaptateur `infrastructure/next-auth/`.

**`src/lib/page-auth.ts`** (`requirePageAccess(pathname)`, 29 lignes) : `getServerSession(authOptions)` ; pas de session → `redirect("/login")` ; `mustChangePassword` et `pathname !== "/profil"` → `redirect("/profil?forcer=1")` ; `!canAccessPath(role, pathname)` → `redirect` vers `homePathFor(role)` si accessible, sinon `/login` (évite une boucle) ; renvoie la session.

**`src/lib/api-auth.ts`** (165 lignes, déjà lu en entier dans ce chantier) : `requireAuth(requireWrite?, opts?)`, `requireInternalAuth(requireWrite?)`, `requireReferentialRead()`, `requireTerrainWrite()`, `extractId(value)`, `isWithinClientScope(auth, documentClientId)`, `TEAM_SCOPE_ERROR`, `chauffeurWithoutTeamError(auth)`, `isWithinTeamScope(auth, operationEquipeId)` — transposition **verbatim**, aucune règle ne change.

**`src/middleware.ts`** : exporte `withAuth` (bibliothèque `next-auth/middleware`) directement, **n'importe pas** `@/lib/auth` ni `authOptions` — aucun changement requis par le déplacement de `authOptions` (vérifier ce point en tâche 1, ne pas le modifier si l'analyse le confirme).

**`src/app/api/auth/[...nextauth]/route.ts`** : `NextAuth(authOptions)` — importe `authOptions` depuis `@/lib/auth`, à corriger vers le nouvel emplacement (import direct, ce fichier appartient déjà à `comptes`, pas besoin de passer par `comptes/index.ts`).

**`src/shared/acces/acteur.ts`** : le type `Acteur` (`id, role, clientId?, equipeId?`) existe déjà, **non consommé aujourd'hui** — ce sous-plan ne le modifie pas, il l'utilise potentiellement comme forme de retour cohérente pour l'avenir mais ne force pas un changement du type `AuthResult` actuel (voir tâche 2 : `AuthSuccess`/`AuthFailure` restent inchangés, aucune raison de changement de comportement).

**Consommateurs de `@/lib/api-auth` (hors tests), par catégorie :**
| Catégorie | Fichiers |
|---|---|
| Domaines déjà hexagonaux (19) | `clients-sites/http/{clients.detail,clients.liste,sites.detail,sites.liste}.controleur.ts` ; `comptes/http/{change-password,mail-test,utilisateurs.detail,utilisateurs.liste,utilisateurs.reset-password,utilisateurs.send-reset-link}.controleur.ts` ; `equipements/http/{detail,liste}.controleur.ts` ; `equipes/http/{detail,liste}.controleur.ts` ; `vehicules/http/{detail,liste}.controleur.ts` |
| Routes pas encore migrées (9) | `src/app/api/{dashboard/stats,import,operations,operations/[id],operations/[id]/photos,operations/[id]/rapport,operations/[id]/statut,operations/planning,recurrences,recurrences/[id],recurrences/generate}/route.ts` (compter précisément au moment de l'exécution, la liste peut avoir un fichier de plus ou de moins selon la structure exacte des dossiers `[id]`) |

**Consommateurs de `@/lib/page-auth` (hors tests, 15) :** `src/app/(dashboard)/{acces-limite,clients,equipements,equipes,import,operations,operations/[id],operations/nouveau,operations/planning,page,profil,recurrences,terrain,utilisateurs,vehicules}/page.tsx`.

**Modules déjà orphelins depuis R3b (suivi tracé, à supprimer dans ce sous-plan) :** `src/lib/auth/reset-token.ts`, `src/lib/auth/account-mail.ts`, `src/lib/email.ts` — leur logique vit déjà dans `comptes/{infrastructure/mongoose/jeton.repository.mongoose.ts, infrastructure/email/gabarits-email.ts, infrastructure/generateur-de-secrets.aleatoire.ts}` ; zéro importeur de production (vérifié en R3b) ; `tests/integration/reset-token.test.ts` et `tests/unit/account-mail.test.ts` (ce dernier déjà repointé vers le vrai module en R3b) référencent encore les fichiers `src/lib/auth/*` pour des appels directs sur la même collection Mongo — à retargeter vers `JetonRepositoryMongoose`/`gabarits-email.ts`.

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `src/backend/comptes/domain/session.ts` (créer) | Règle pure de validité de session |
| `src/backend/comptes/infrastructure/next-auth/{options,rafraichissement}.ts` (créer) | Configuration NextAuth, rafraîchissement de jeton |
| `src/backend/comptes/http/{acteur,garde-pages}.ts` (créer) | Gardes de routes et de pages |
| `src/backend/comptes/index.ts` (modifier) | Ré-exporte les gardes pour les autres domaines |
| 43 fichiers consommateurs (modifier) | Codemod des imports uniquement |
| `src/lib/{api-auth,page-auth,auth,auth-refresh}.ts`, `src/lib/auth/{reset-token,account-mail}.ts`, `src/lib/email.ts` (supprimer) | Ancien code, remplacé |

---

### Task 1 : Identité NextAuth (`infrastructure/next-auth/`, règle pure de session)

**Files:**
- Create: `src/backend/comptes/domain/session.ts` (+ `.test.ts`), `src/backend/comptes/infrastructure/next-auth/options.ts`, `src/backend/comptes/infrastructure/next-auth/rafraichissement.ts` (+ `.test.ts`)
- Move (contenu adapté, pas verbatim — voir Step 2/3) : `src/lib/auth.ts`, `src/lib/auth-refresh.ts`
- Modify: `src/app/api/auth/[...nextauth]/route.ts`, `tests/integration/{auth-refresh,session-invalidation,must-change-password}.test.ts` (chemins d'import)

**Interfaces:**
- Produit : `sessionEstValide(options: {passwordChangedAtMs?: number; issuedAtMs?: number}): boolean` (ou signature équivalente portant les mêmes deux valeurs numériques, sans type `Date`/`JWT` de bibliothèque dans le domaine) ; `authOptions: NextAuthOptions` (inchangé, réexporté depuis le nouvel emplacement) ; `needsRefresh`, `refreshTokenFromDb` (transposés, `refreshTokenFromDb` appelle `sessionEstValide` au lieu de comparer les dates en ligne).
- Consomme : `connectDB`, `UtilisateurModel` (`@/backend/comptes/infrastructure/mongoose/utilisateur.model`, déjà dans le même domaine — import relatif direct, pas besoin de passer par un port pour un fichier `infrastructure/`).

- [ ] **Step 0 : Branche et base de départ.** `git switch -c refactor/r3c-comptes-identite-gardes` (depuis `main`), `npx vitest run 2>&1 | grep -E "Test Files|Tests "` → 875 tests verts, `npx tsc --noEmit` propre, `npm run lint` 0 erreur. Vérifier `src/middleware.ts` : confirmer par lecture qu'il n'importe ni `@/lib/auth` ni `authOptions` (déjà noté dans les Faits vérifiés) — si c'est bien le cas, ce fichier ne sera touché par aucune tâche de ce plan ; sinon, s'arrêter et signaler (BLOCKED), le plan devrait alors être ajusté.

- [ ] **Step 1 : Règle pure `domain/session.ts`, TDD.**

```ts
// src/backend/comptes/domain/session.test.ts
import { describe, it, expect } from "vitest";
import { sessionEstValide } from "./session";

describe("sessionEstValide", () => {
  it("valide sans passwordChangedAt", () => {
    expect(sessionEstValide({ issuedAtMs: 1000 })).toBe(true);
  });
  it("invalide si passwordChangedAt est postérieur à issuedAt", () => {
    expect(sessionEstValide({ issuedAtMs: 1000, passwordChangedAtMs: 2000 })).toBe(false);
  });
  it("valide si passwordChangedAt est antérieur ou égal à issuedAt", () => {
    expect(sessionEstValide({ issuedAtMs: 2000, passwordChangedAtMs: 1000 })).toBe(true);
    expect(sessionEstValide({ issuedAtMs: 2000, passwordChangedAtMs: 2000 })).toBe(true);
  });
  it("un jeton sans issuedAt est considéré antérieur à toute réinitialisation", () => {
    expect(sessionEstValide({ passwordChangedAtMs: 1000 })).toBe(false);
  });
});
```

Run : FAIL (module absent). Puis :

```ts
// src/backend/comptes/domain/session.ts
/**
 * Vrai si la session reste valide : soit le mot de passe n'a jamais été
 * changé depuis, soit ce changement est antérieur ou simultané à l'émission
 * du jeton. Un jeton sans `issuedAtMs` est traité comme antérieur à toute
 * réinitialisation (valeur 0), donc invalidé par tout `passwordChangedAtMs`.
 */
export function sessionEstValide(options: { issuedAtMs?: number; passwordChangedAtMs?: number }): boolean {
  if (options.passwordChangedAtMs === undefined) return true;
  return (options.issuedAtMs ?? 0) >= options.passwordChangedAtMs;
}
```

Run : PASS.

- [ ] **Step 2 : Déplacer `auth-refresh.ts`, appeler la règle pure.**

```bash
mkdir -p src/backend/comptes/infrastructure/next-auth
git mv src/lib/auth-refresh.ts src/backend/comptes/infrastructure/next-auth/rafraichissement.ts
```

Modifier le fichier déplacé : remplacer la comparaison en ligne (`user.passwordChangedAt && (token.issuedAt ?? 0) < user.passwordChangedAt.getTime()`) par un appel à `!sessionEstValide({ issuedAtMs: token.issuedAt, passwordChangedAtMs: user.passwordChangedAt?.getTime() })`, import relatif `../../domain/session`. Comportement identique (même condition, juste reformulée par la négative — vérifier ce point avec précision : l'ancienne condition invalide si `passwordChangedAt && issuedAt < passwordChangedAt` ; la nouvelle route doit produire l'invalidation exactement dans les mêmes cas, y compris quand `passwordChangedAt` est absent — dans ce cas `sessionEstValide` renvoie toujours `true`, donc pas d'invalidation, ce qui correspond au comportement actuel où `user.passwordChangedAt &&` court-circuite à `false`). Le reste de `refreshTokenFromDb` (connexion, requête, cas compte absent, champs renvoyés) ne change pas. Codemod des importeurs :

```bash
node scripts/dev/remplacer-imports.mjs "@/lib/auth-refresh" "@/backend/comptes/infrastructure/next-auth/rafraichissement"
git diff --stat
```

- [ ] **Step 3 : Déplacer `auth.ts`, sans changement de logique.**

```bash
git mv src/lib/auth.ts src/backend/comptes/infrastructure/next-auth/options.ts
node scripts/dev/remplacer-imports.mjs "@/lib/auth" "@/backend/comptes/infrastructure/next-auth/options"
git diff --stat
```

Dans le fichier déplacé, mettre à jour uniquement les imports relatifs (`@/backend/comptes/infrastructure/mongoose/utilisateur.model` déjà correct puisqu'il pointait déjà là depuis R3b ; `@/lib/auth-refresh` → `./rafraichissement`). Aucune autre ligne ne change (le contenu du callback `jwt`/`session`, le provider, les déclarations de module `next-auth`/`next-auth/jwt` restent identiques).

**Attention à l'ordre des remplacements** (leçon R3a) : `@/lib/auth-refresh` et `@/lib/auth` sont deux chaînes distinctes qui ne se chevauchent pas en tant que préfixe l'une de l'autre dans ce cas précis (`auth-refresh` ne commence pas par `auth` suivi d'un caractère de chemin), mais vérifier tout de même par grep qu'aucun remplacement n'a produit de double substitution.

- [ ] **Step 4 : Route NextAuth.**

```ts
// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import { authOptions } from "@/backend/comptes/infrastructure/next-auth/options";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
```

- [ ] **Step 5 : Grep indépendant, vérifier, commit.**

```bash
grep -rn "@/lib/auth\b\|@/lib/auth-refresh" src tests scripts
```
Doit être vide (hors chaînes de commentaire éventuelles à vérifier au cas par cas). Run: `npx tsc --noEmit && npm run lint 2>&1 | tail -1 && npx vitest run 2>&1 | grep -E "Test Files|Tests "`. `tests/integration/{auth-refresh,session-invalidation,must-change-password}.test.ts` doivent passer avec **seulement** des changements de chemins d'import. Puis `verifier-build`.

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!package.json'
git commit -m "refactor(comptes): identité NextAuth déplacée (options, rafraîchissement, règle pure de validité de session)"
```

---

### Task 2 : `Acteur` — gardes de routes (remplace `@/lib/api-auth`, 33 importeurs)

**Files:**
- Move: `src/lib/api-auth.ts` → `src/backend/comptes/http/acteur.ts` (contenu **verbatim**)
- Modify: `src/backend/comptes/index.ts` (ré-exporter toutes les fonctions de `acteur.ts`) ; les 33 fichiers consommateurs listés dans les « Faits vérifiés » (19 domaines hexagonaux + 9-10 routes non migrées + `comptes` lui-même, en import relatif direct puisqu'il est dans le même domaine) ; `tests/unit/client-scope.test.ts` (ou équivalent testant `isWithinClientScope` directement, si un tel fichier existe — vérifier par grep)

**Interfaces:**
- Produit : `requireAuth`, `requireInternalAuth`, `requireReferentialRead`, `requireTerrainWrite`, `extractId`, `isWithinClientScope`, `TEAM_SCOPE_ERROR`, `chauffeurWithoutTeamError`, `isWithinTeamScope`, `AuthResult`, `AuthSuccess`, `AuthFailure` — noms et signatures **inchangés**.

- [ ] **Step 1 : Déplacer, verbatim.**

```bash
git mv src/lib/api-auth.ts src/backend/comptes/http/acteur.ts
```

Lire le fichier déplacé : ses imports (`@/lib/auth` → `../infrastructure/next-auth/options`, `@/shared/acces/permissions`, `@/shared/acces/roles`) à corriger pour le premier seulement (le second et le troisième sont déjà `shared`, inchangés).

- [ ] **Step 2 : `index.ts`.**

```ts
// src/backend/comptes/index.ts (ajouter aux exports existants — ne pas écraser
// existeUtilisateurAvecClientId/existeUtilisateurAvecEquipeId déjà présents)
export {
  requireAuth,
  requireInternalAuth,
  requireReferentialRead,
  requireTerrainWrite,
  extractId,
  isWithinClientScope,
  TEAM_SCOPE_ERROR,
  chauffeurWithoutTeamError,
  isWithinTeamScope,
} from "./http/acteur";
export type { AuthResult, AuthSuccess, AuthFailure } from "./http/acteur";
```

- [ ] **Step 3 : Codemod de tous les importeurs.**

```bash
node scripts/dev/remplacer-imports.mjs "@/lib/api-auth" "@/backend/comptes"
git diff --stat
```

Relire intégralement (33+ fichiers attendus) : annuler toute modification collatérale. Pour les 6 fichiers de `src/backend/comptes/http/*.controleur.ts` eux-mêmes, préférer l'import relatif direct (`./acteur`) plutôt que `@/backend/comptes` (un domaine n'a pas besoin de passer par son propre `index.ts`) — corriger ces 6 imports à la main après le codemod générique si celui-ci les a laissés pointer vers `@/backend/comptes`. **Grep indépendant obligatoire** :

```bash
grep -rln "@/lib/api-auth" src tests scripts
```
Doit être vide.

- [ ] **Step 4 : Vérifier et commit**

Run: `npx tsc --noEmit && npm run lint 2>&1 | tail -1 && npx vitest run 2>&1 | grep -E "Test Files|Tests "`. Toutes les routes concernées (les 33 listées, plus les tests d'intégration qui les exercent : `authz-roles`, `chauffeur-scope`, `api-auth`, `client-scope`, `referentiels-api`, `operations-api`, `recurrences-api`, etc.) passent avec **seulement** des changements de chemins d'import. Puis `verifier-build`.

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!package.json'
git status --short | head -50
git commit -m "refactor(comptes): gardes de routes (Acteur) déplacées vers backend/comptes/http/acteur.ts ; tous les importeurs recodemodés"
```

---

### Task 3 : Gardes de pages (remplace `@/lib/page-auth`, 15 importeurs)

**Files:**
- Move: `src/lib/page-auth.ts` → `src/backend/comptes/http/garde-pages.ts` (contenu verbatim)
- Modify: `src/backend/comptes/index.ts` (ajouter `requirePageAccess`) ; les 15 fichiers `page.tsx` listés dans les « Faits vérifiés »

**Interfaces:**
- Produit : `requirePageAccess(pathname): Promise<Session>` — inchangé.

- [ ] **Step 1 : Déplacer, verbatim.**

```bash
git mv src/lib/page-auth.ts src/backend/comptes/http/garde-pages.ts
```

Corriger son import `@/lib/auth` → `../infrastructure/next-auth/options` (`@/shared/acces/acces-pages` reste inchangé, déjà `shared`).

- [ ] **Step 2 : `index.ts`.**

```ts
// ajouter aux exports existants
export { requirePageAccess } from "./http/garde-pages";
```

- [ ] **Step 3 : Codemod des 15 pages.**

```bash
node scripts/dev/remplacer-imports.mjs "@/lib/page-auth" "@/backend/comptes"
git diff --stat
grep -rln "@/lib/page-auth" src tests
```
Le grep final doit être vide.

- [ ] **Step 4 : Vérifier et commit**

Run: `npx tsc --noEmit && npm run lint 2>&1 | tail -1 && npx vitest run 2>&1 | grep -E "Test Files|Tests "`. `tests/unit/page-guards.test.ts` passe avec seulement un changement de chemin d'import. Puis `verifier-build` (vérifier notamment que les 15 pages compilent et que leurs redirections sont listées comme attendu dans la sortie du build).

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!package.json'
git commit -m "refactor(comptes): garde de pages déplacée vers backend/comptes/http/garde-pages.ts ; les 15 pages recodemodées"
```

---

### Task 4 : Nettoyage — suppression des trois modules orphelins de R3b

**Files:**
- Delete: `src/lib/auth/reset-token.ts`, `src/lib/auth/account-mail.ts`, `src/lib/email.ts` (dossier `src/lib/auth/` supprimé s'il devient vide)
- Modify: `tests/integration/reset-token.test.ts` (retargeter vers `JetonRepositoryMongoose`), `tests/unit/account-mail.test.ts` (déjà repointé en R3b vers `gabarits-email.ts` — vérifier qu'il n'importe plus rien de `src/lib/auth/account-mail.ts`, aucune action attendue si c'est déjà le cas)

**Interfaces:** aucune nouvelle — ce sont des suppressions pures, la logique équivalente vit déjà dans `comptes/infrastructure/mongoose/jeton.repository.mongoose.ts` et `comptes/infrastructure/email/gabarits-email.ts` depuis R3b.

- [ ] **Step 1 : Vérifier qu'aucun importeur de production ne subsiste** (déjà confirmé en R3b, revérifier après les tâches 1-3 de ce plan qui ont pu introduire de nouveaux fichiers) :

```bash
grep -rln "@/lib/auth/reset-token\|@/lib/auth/account-mail\|@/lib/email\b" src --include="*.ts" --include="*.tsx" | grep -v "\.test\."
```
Doit être vide (ou ne contenir que ce que ce step va lui-même corriger dans les tests, en excluant `.test.ts` ci-dessus qui isole déjà la production).

- [ ] **Step 2 : Retargeter `tests/integration/reset-token.test.ts`.** Lire le fichier : il appelle probablement `issueResetToken`/`consumeResetToken` directement pour préparer des jetons ou vérifier des invariants indépendamment des routes HTTP. Remplacer ces appels par les méthodes équivalentes de `JetonRepositoryMongoose` (`src/backend/comptes/infrastructure/mongoose/jeton.repository.mongoose.ts`, déjà testé par son propre fichier de contrat, `jeton.repository.mongoose.test.ts` — **ne pas dupliquer cette couverture**, seulement adapter les appels de ce fichier historique à la nouvelle API si son intention diffère de celle du test de contrat). Si après lecture ce fichier s'avère être une redondance complète du test de contrat de la tâche 1 de R3b, le signaler explicitement dans le rapport plutôt que de le dupliquer inutilement — mais ne pas le supprimer sans une ruling explicite du contrôleur (une suppression de test est plus délicate qu'un déplacement, à signaler en `DONE_WITH_CONCERNS` si ce cas se présente).

- [ ] **Step 3 : Supprimer les trois fichiers.**

```bash
git rm src/lib/auth/reset-token.ts src/lib/auth/account-mail.ts src/lib/email.ts
rmdir src/lib/auth 2>/dev/null || true
```

- [ ] **Step 4 : Vérifier et commit**

Run: `npx tsc --noEmit && npm run lint 2>&1 | tail -1 && npx vitest run 2>&1 | grep -E "Test Files|Tests "`. Puis `verifier-build`.

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!package.json'
git commit -m "refactor(comptes): suppression des modules orphelins depuis R3b (reset-token, account-mail, email)"
```

---

### Task 5 : Documentation, statuts et revue du jalon

**Files:** `README.md`, `docs/superpowers/plans/2026-09-20-refactor-architecture-master.md`, `docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md`

- [ ] **Step 1 : README.** Confirmer `comptes` toujours seul dans la liste des domaines backend migrés (rien ne change ici, R3c ne migre pas de nouveau domaine, il termine celui déjà en cours) ; mentionner que l'identité (NextAuth) et les gardes (routes, pages) sont désormais dans `comptes/` ; vérifier chaque chemin cité.
- [ ] **Step 2 : Statuts.** Plan maître : la ligne R3 passe de « En cours (3a, 3b réalisés ; 3c à venir) » à **« Réalisé »** — R3 est maintenant complet, les trois sous-plans sont faits. Spec : mettre à jour la ligne de statut (« R0, R1, R2 et R3 réalisés ; jalons R4 à R9 à venir »). Ajouter dans « Enseignements » une section « Enseignements de R3c » : la portée d'un sous-plan de fin de domaine peut être bien plus large que le domaine lui-même (43 fichiers dans 6+ domaines/dossiers différents ont dû être recodemodés pour purger `@/lib/api-auth`/`@/lib/page-auth`) — supprimer un fichier partagé transitoire exige de migrer TOUS ses importeurs d'un coup, y compris ceux dont le domaine propriétaire n'est pas encore hexagonal ; une règle métier de validité de session peut être extraite en règle de domaine pure même quand le reste de son contexte (jeton JWT, session NextAuth) reste résolument un problème d'infrastructure.
- [ ] **Step 3 : Vérification complète** : `npx tsc --noEmit && npm run lint && npx vitest run`, puis `verifier-build`.
- [ ] **Step 4 : Non-régression ciblée** (à consigner dans le rapport) : `git diff main --stat -- tests/unit tests/integration` — chemins d'import seulement ; comparer (méthode R0-R3b, `git archive`) au moins : connexion réussie/échouée (identifiant email ou username, mot de passe erroné, compte absent — même message dans les trois cas), page protégée sans session (redirection `/login`), page interdite pour un rôle (redirection vers la page d'accueil du rôle ou `/login`), `mustChangePassword` forçant `/profil?forcer=1`, une route API sans session (401), une route API avec un rôle refusé (403), le comportement de `isWithinClientScope`/`isWithinTeamScope` sur au moins une route de chaque catégorie (`clients-sites`, `operations` non migré).
- [ ] **Step 5 : Commit**

```bash
git add README.md docs/superpowers
git commit -m "docs: statuts de clôture du jalon R3 (comptes) — R3 réalisé"
```

- [ ] **Step 6 : Revue du jalon** — **effectuée par le contrôleur** (revue finale de branche complète, modèle le plus capable ; ne pas la dispatcher comme tâche), comme pour R1, R2, R3a et R3b. Critères : aucun changement de comportement sur l'authentification, le rafraîchissement de session, les 43 routes/pages recodemodées ; `@/lib/api-auth`, `@/lib/page-auth`, `@/lib/auth`, `@/lib/auth-refresh`, `@/lib/auth/{reset-token,account-mail}`, `@/lib/email` tous supprimés, aucun import résiduel ; `src/middleware.ts` inchangé (ou changé seulement si la tâche 1 a trouvé un besoin réel, documenté) ; `package.json` absent de tous les commits ; CI verte sur clone propre. **Domaine sensible, dernier sous-plan de R3 : vérifier explicitement qu'aucun secret n'a été journalisé, que la comparaison bcrypt n'a pas changé, et que la logique d'invalidation de session (le cœur de la sécurité de ce sous-plan) est couverte par au moins un test qui la fait échouer si on la casse délibérément (injection temporaire d'un bug dans `sessionEstValide`, constat de l'échec du test, annulation).**

---

## Auto-relecture

- **Couverture de la spec (jalon R3, clôture) :** identité NextAuth + règle pure (tâche 1) ; gardes de routes (tâche 2) ; gardes de pages (tâche 3) ; nettoyage des orphelins de R3b (tâche 4) ; documentation et revue (tâche 5). Après cette tâche, R3 est intégralement réalisé (3a, 3b, 3c).
- **Cohérence des noms :** `sessionEstValide` (tâche 1) ; `authOptions`, `needsRefresh`, `refreshTokenFromDb` (tâche 1, transposés) ; toutes les fonctions de `acteur.ts`/`garde-pages.ts` (tâches 2-3) gardent exactement leurs noms actuels.
- **Points de vigilance :** (1) la portée des tâches 2-3 dépasse largement `comptes` — l'exécutant doit lire la table des 43 fichiers, pas seulement supposer que le codemod générique les trouve tous, et grep indépendamment à chaque étape (leçon R3a/R3b, particulièrement critique ici vu le nombre de fichiers) ; (2) `sessionEstValide` doit produire l'invalidation dans **exactement** les mêmes cas que l'ancienne comparaison en ligne — un test doit vérifier le cas `passwordChangedAt` absent (jamais invalidé) en plus des cas déjà couverts par les tests existants ; (3) ne pas toucher `src/middleware.ts` sauf si la tâche 1 démontre par la lecture qu'un changement est réellement nécessaire (documenté auquel cas) ; (4) la tâche 4 peut découvrir que `tests/integration/reset-token.test.ts` est une redondance complète du test de contrat de R3b — dans ce cas, signaler plutôt que de dupliquer ou de supprimer unilatéralement ; (5) `package.json` ne doit jamais être staged (leçon R2/R3a/R3b) — chaque commande `git add` de ce plan l'exclut explicitement ; (6) après la tâche 5, le plan maître doit afficher R3 « Réalisé », pas « En cours » — c'est la première fois que ce mot s'applique à R3.
