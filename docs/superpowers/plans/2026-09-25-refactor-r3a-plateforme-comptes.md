# Refactoring R3a — Socle plateforme du domaine `comptes` : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Déplacer les cinq briques transverses dont `comptes` a besoin (e-mail, limiteur de débit, exécution différée, horloge, adresse client/URL applicative) dans `src/backend/platform/`, sans aucun changement de comportement. C'est le premier des trois sous-plans du jalon R3 (« sensible ») ; 3b (cas d'usage et adaptateurs de `comptes`) et 3c (NextAuth, `Acteur`, gardes) seront détaillés après que 3a soit fusionné.

**Architecture:** Contrairement aux domaines migrés jusqu'ici (`equipes`, `vehicules`, `equipements`, `clients-sites`), `platform/` n'est pas un domaine métier : pas de `domain/`/`application/` séparés, juste des modules plats (voir le précédent `platform/base-de-donnees/`, `platform/http/identifiants.ts` du jalon R0). Le code source (`src/lib/mail/**`, `src/lib/rate-limit.ts`, `src/lib/run-after.ts`, `src/lib/app-url.ts`) est déjà bien isolé et déjà testé : ce sous-plan est majoritairement des déplacements de fichiers (`git mv` + codemod des imports), à l'exception de `horloge/`, entièrement nouveau.

**Tech Stack:** Next.js 16 (`src/`), TypeScript, Nodemailer, Mongoose, Vitest + mongodb-memory-server, ESLint 9.

**Spec / feuille de route:** `docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md` (arborescence cible ligne 45-51 : `platform/{base-de-donnees,email,limiteur-debit,execution-differee,horloge,http}` ; table des domaines ligne 99 : `comptes` dépend de `EnvoiEmail`, `LimiteurDebit`, `ExecutionDifferee`, `Horloge`) ; `docs/superpowers/plans/2026-09-20-refactor-architecture-master.md` (contraintes globales, `verifier-build`, enseignements de R0-R2) ; modèle de référence **déjà présent dans le dépôt** : `src/backend/platform/base-de-donnees/**`, `src/backend/platform/http/identifiants.ts`.

## Global Constraints

- **Aucun changement de comportement** : mêmes exports, mêmes signatures, mêmes valeurs de retour, mêmes messages d'erreur, mêmes noms de variables d'environnement lues. Aucune fonction n'est renommée (seuls les fichiers changent de dossier) — c'est délibéré : ce sont déjà des noms techniques stables (`sendMail`, `consumeRateLimit`, `runAfterResponse`, `appBaseUrl`, `clientIp`), pas du vocabulaire métier à franciser.
- Les tests existants ne changent que par leurs **chemins d'import**. Aucune assertion supprimée, affaiblie ou passée en `skip`.
- À chaque commit : `npx tsc --noEmit` propre, `npm run lint` (0 erreur), `npx vitest run` tout vert (789 tests au départ).
- Ne jamais lire ni afficher `.env.local` ; ne jamais lancer `npm run build`, `npm run seed`, `scripts/seed-admin.ts` ni `scripts/send-test-mail.ts` ; aucun e-mail réel. Compilation Next : uniquement la commande `verifier-build` du plan maître (variables factices).
- Ne jamais stager `.agents/`, `.claude/`, `skills-lock.json`, `rapports/`, `package.json` (ce dernier porte une modification locale non liée — port du serveur de dev — à ne jamais committer). Commande d'ajout : `git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!package.json'`.
- Après chaque passage d'un codemod d'imports : `git diff --stat`, et `git checkout -- <fichier>` pour tout fichier modifié à tort — **jamais** `git reset`.
- Langue : dossiers de plateforme et noms de fichiers en français (comme `base-de-donnees/connexion.ts`, `http/identifiants.ts`) ; les exports eux-mêmes gardent leurs noms techniques existants (voir ci-dessus).
- Branche : `refactor/r3a-plateforme-comptes` créée depuis `main` (`95b79ce`).

### Faits vérifiés sur le code actuel (base du plan)

| Module | Fichiers actuels | Exports publics | Importeurs actuels |
|---|---|---|---|
| E-mail | `src/lib/mail/{index.ts,config.ts,types.ts,smtp-transport.ts,memory-transport.ts}` | `sendMail`, `resolveTransport`, `getMemoryTransport`, `MailConfigError`, `readSmtpConfig`, `SmtpConfig`, `SmtpTransport`, `MemoryTransport`, `MailMessage`, `MailResult`, `MailTransport`, `MailAttachment` | `src/app/api/mail/test/route.ts`, `src/lib/auth/account-mail.ts`, `tests/unit/{mail-transport,mail-send,mail-config}.test.ts`, `tests/integration/{user-invitation,users-auth,mail-test-route,send-reset-link,password-reset-flow}.test.ts` |
| Limiteur de débit | `src/lib/rate-limit.ts` (fonction `consumeRateLimit` + `clientIp`), `src/models/RateLimit.ts` | `consumeRateLimit`, `RateLimitResult`, `clientIp` (à séparer : `clientIp` part dans `platform/http/`, voir plus bas) | `src/app/api/auth/{forgot-password,reset-password}/route.ts`, `src/app/api/mail/test/route.ts`, `src/app/api/users/[id]/send-reset-link/route.ts`, `tests/integration/{rate-limit,send-reset-link,password-reset-flow,mail-test-route}.test.ts` |
| Exécution différée | `src/lib/run-after.ts` | `runAfterResponse` | `src/app/api/auth/{forgot-password,reset-password}/route.ts`, `tests/unit/run-after.test.ts` |
| Adresse client | `clientIp` dans `src/lib/rate-limit.ts` (lignes 74-81) | `clientIp` | même liste que « Limiteur de débit » ci-dessus (il est importé depuis le même fichier aujourd'hui) |
| URL applicative | `src/lib/app-url.ts` | `appBaseUrl`, `AppUrlError` | `src/app/api/auth/forgot-password/route.ts`, `src/app/api/users/route.ts`, `src/app/api/users/[id]/send-reset-link/route.ts`, `tests/unit/app-url.test.ts` |
| Horloge | **n'existe pas** — `new Date()`/`Date.now()` appelés directement partout | — | — (nouveau ; non consommé par ce sous-plan, `comptes` (3b) et `operations` (R4) le consommeront) |
| Modèle `RateLimit` | `src/models/RateLimit.ts` : `{key: String unique, count: Number défaut 0, expiresAt: Date}`, index TTL `expiresAt` (`expireAfterSeconds: 0`) | — | non listé dans `enregistrement-modeles.ts` aujourd'hui (aucun `populate` ne le référence) : **aucune ligne à y ajouter** |
| Hors périmètre de 3a | `src/lib/auth/reset-token.ts` (jetons, dépend de `PasswordResetToken`/`User`), `src/lib/auth/account-mail.ts`, `src/lib/email.ts` (`generateRandomPassword`), `src/lib/users/scope.ts`, `src/lib/api-auth.ts`, `src/lib/auth.ts`, `src/lib/auth-refresh.ts`, `src/lib/page-auth.ts` | — | Ce sont les briques `JetonRepository`, `HacheurMotDePasse`/`GenerateurDeSecrets`, NextAuth/`Acteur` et les gardes — **3b et 3c**, pas ce sous-plan. Ne pas y toucher. |

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `src/backend/platform/email/**` (créer) | Port `MailTransport` + adaptateurs SMTP/mémoire + orchestration `sendMail` |
| `src/backend/platform/limiteur-debit/**` (créer) | `consumeRateLimit` + modèle Mongoose `RateLimit` |
| `src/backend/platform/execution-differee/execution-differee.ts` (créer) | `runAfterResponse` |
| `src/backend/platform/horloge/horloge.ts` (créer) | `Horloge` (interface) + `SystemClock` (nouveau) |
| `src/backend/platform/http/{adresse-client,url-applicative}.ts` (créer) | `clientIp`, `appBaseUrl` |

---

### Task 1 : `platform/email/`

**Files:**
- Move: `src/lib/mail/{index.ts,config.ts,types.ts,smtp-transport.ts,memory-transport.ts}` → `src/backend/platform/email/{index.ts,config.ts,types.ts,smtp-transport.ts,memory-transport.ts}` (mêmes noms de fichiers, seul le dossier change)
- Modify: `src/app/api/mail/test/route.ts`, `src/lib/auth/account-mail.ts`, tous les importeurs listés dans la table « Faits vérifiés » ci-dessus (codemod)

**Interfaces:**
- Produit : inchangé — `sendMail(message, env?)`, `resolveTransport(env?)`, `getMemoryTransport()`, `MailConfigError`, `readSmtpConfig(env)`, `SmtpConfig`, `SmtpTransport`, `MemoryTransport`, `MailMessage`, `MailResult`, `MailTransport`, `MailAttachment` — désormais importés depuis `@/backend/platform/email` (et ses sous-modules `@/backend/platform/email/{config,types,smtp-transport,memory-transport}`).

- [ ] **Step 0 : Branche et base de départ.** `git switch -c refactor/r3a-plateforme-comptes` (depuis `main`), puis `npx vitest run 2>&1 | grep -E "Test Files|Tests "` → 789 tests verts, `npx tsc --noEmit` propre, `npm run lint` 0 erreur.

- [ ] **Step 1 : Déplacer, sans changement de contenu.**

```bash
mkdir -p src/backend/platform/email
git mv src/lib/mail/index.ts src/backend/platform/email/index.ts
git mv src/lib/mail/config.ts src/backend/platform/email/config.ts
git mv src/lib/mail/types.ts src/backend/platform/email/types.ts
git mv src/lib/mail/smtp-transport.ts src/backend/platform/email/smtp-transport.ts
git mv src/lib/mail/memory-transport.ts src/backend/platform/email/memory-transport.ts
rmdir src/lib/mail
```

- [ ] **Step 2 : Codemod des imports.**

```bash
node scripts/dev/remplacer-imports.mjs "@/lib/mail/config" "@/backend/platform/email/config"
node scripts/dev/remplacer-imports.mjs "@/lib/mail/types" "@/backend/platform/email/types"
node scripts/dev/remplacer-imports.mjs "@/lib/mail" "@/backend/platform/email"
git diff --stat
```

Relire `git diff --stat` : annuler avec `git checkout -- <fichier>` tout fichier modifié à tort (commentaires, fixtures). **Attention à l'ordre** : `@/lib/mail/config` et `@/lib/mail/types` doivent être remplacés **avant** `@/lib/mail` (sinon le remplacement générique produirait `@/backend/platform/email/config` → `@/backend/platform/email/backend/platform/email/config` sur un second passage ; lancer les trois commandes dans l'ordre ci-dessus une seule fois chacune suffit à l'éviter). Vérifier ensuite qu'aucun fichier ne contient plus `@/lib/mail` (`grep -rl "@/lib/mail" src tests` doit être vide) et que `src/backend/platform/email/index.ts` importe bien depuis ses propres voisins (`@/backend/platform/email/config`, pas `@/lib/mail/config`).

- [ ] **Step 3 : Vérifier**

Run: `npx tsc --noEmit && npm run lint 2>&1 | tail -1 && npx vitest run 2>&1 | grep -E "Test Files|Tests "`
Expected : tout vert ; `tests/unit/{mail-transport,mail-send,mail-config}.test.ts` et les 5 tests d'intégration listés dans les « Faits vérifiés » passent avec **seulement** des changements de chemins d'import.

- [ ] **Step 4 : Commit**

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!package.json'
git status --short | head -20
git commit -m "refactor(platform): déplacement du module e-mail vers backend/platform/email"
```

---

### Task 2 : `platform/limiteur-debit/`

**Files:**
- Move: `src/models/RateLimit.ts` → `src/backend/platform/limiteur-debit/rate-limit.model.ts`
- Create: `src/backend/platform/limiteur-debit/rate-limit.ts` (contenu = `consumeRateLimit` et `RateLimitResult` de l'actuel `src/lib/rate-limit.ts`, **sans** `clientIp` ni `isDuplicateKey`/`hashId` qui restent des détails internes déplacés avec la fonction)
- Delete: `src/lib/rate-limit.ts` **après** que `clientIp` en soit extrait par la Tâche 3 (voir note d'ordre ci-dessous) — **cette tâche ne supprime pas encore le fichier**, elle y laisse `clientIp` (et ses imports `Request`) intact et retire seulement `consumeRateLimit`, `hashId`, `isDuplicateKey`, `RateLimitResult` et les imports `connectDB`/`RateLimit`/`createHash` devenus inutiles à ces lignes.
- Modify: importeurs de `consumeRateLimit` (codemod partiel — voir Step 2)

**Interfaces:**
- Produit : inchangé — `consumeRateLimit(scope, id, opts, now?)`, `RateLimitResult`, depuis `@/backend/platform/limiteur-debit/rate-limit`. Le modèle Mongoose est ré-exporté sous le nom `RateLimit` depuis `rate-limit.model.ts` (identique à l'existant).
- Consomme : `connectDB` (`@/backend/platform/base-de-donnees/connexion`).

- [ ] **Step 1 : Déplacer le modèle, sans changement de schéma.**

```bash
mkdir -p src/backend/platform/limiteur-debit
git mv src/models/RateLimit.ts src/backend/platform/limiteur-debit/rate-limit.model.ts
node scripts/dev/remplacer-imports.mjs "@/models/RateLimit" "@/backend/platform/limiteur-debit/rate-limit.model"
git diff --stat
```

- [ ] **Step 2 : Extraire `consumeRateLimit` dans son propre fichier, laisser `clientIp` en place.**

Lire `src/lib/rate-limit.ts` (81 lignes) tel qu'il est actuellement. Créer `src/backend/platform/limiteur-debit/rate-limit.ts` avec exactement les lignes 1-63 du fichier actuel (imports `createHash`, `connectDB`, le modèle déplacé, `RateLimitResult`, `hashId`, `isDuplicateKey`, `consumeRateLimit`), en changeant seulement l'import du modèle :

```ts
import { RateLimit } from "./rate-limit.model";
```

(chemin relatif, plus besoin de `@/models/RateLimit`). Dans `src/lib/rate-limit.ts`, supprimer tout sauf `clientIp` et son commentaire (lignes 65-81) et les imports désormais inutiles (`createHash`, `connectDB`, `RateLimit`) — le fichier ne contient plus, temporairement, que `clientIp`. Codemod :

```bash
node scripts/dev/remplacer-imports.mjs "@/lib/rate-limit" "@/backend/platform/limiteur-debit/rate-limit"
git diff --stat
```

Relire le diff : ce codemod a aussi réécrit les imports de `clientIp` (qui reste dans `src/lib/rate-limit.ts` pour l'instant) vers le nouveau chemin `consumeRateLimit` — **annuler manuellement** ces occurrences précises avec `git checkout -p` ou une édition manuelle, en gardant `clientIp` importé depuis `@/lib/rate-limit` jusqu'à la Tâche 3 (qui le déplace et corrige ces imports à son tour). Si cette étape intermédiaire est trop fragile à distinguer automatiquement, une alternative plus sûre : traiter les importeurs un par un à la main plutôt que par le script générique, en consultant la table « Faits vérifiés » (4 fichiers de route, 4 fichiers de test) pour savoir lesquels importent `consumeRateLimit` (→ nouveau chemin), lesquels importent `clientIp` (→ inchangé pour l'instant) et lesquels importent les deux (`src/app/api/mail/test/route.ts` : vérifier les deux imports séparément).

- [ ] **Step 3 : Vérifier**

Run: `npx tsc --noEmit && npm run lint 2>&1 | tail -1 && npx vitest run 2>&1 | grep -E "Test Files|Tests "`
Expected : tout vert ; `tests/integration/rate-limit.test.ts` passe avec seulement un changement de chemin d'import pour `consumeRateLimit` (son import de `clientIp`, s'il en a un, reste `@/lib/rate-limit` à ce stade).

- [ ] **Step 4 : Commit**

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!package.json'
git status --short | head -20
git commit -m "refactor(platform): déplacement du limiteur de débit vers backend/platform/limiteur-debit"
```

---

### Task 3 : `platform/execution-differee/`, `platform/horloge/` (nouveau), `platform/http/` (adresse client + URL applicative)

**Files:**
- Move: `src/lib/run-after.ts` → `src/backend/platform/execution-differee/execution-differee.ts`
- Move: `clientIp` de `src/lib/rate-limit.ts` (dernier reste du fichier) → `src/backend/platform/http/adresse-client.ts` ; supprimer `src/lib/rate-limit.ts` (vide après ce déplacement)
- Move: `src/lib/app-url.ts` → `src/backend/platform/http/url-applicative.ts`
- Create: `src/backend/platform/horloge/horloge.ts` (+ `.test.ts`)
- Modify: tous les importeurs listés dans la table « Faits vérifiés » pour ces trois modules (codemod), plus les imports de `clientIp` laissés en `@/lib/rate-limit` par la Tâche 2

**Interfaces:**
- Produit : `runAfterResponse` (inchangé) ; `clientIp` (inchangé) ; `appBaseUrl`, `AppUrlError` (inchangés) ; **nouveau** — `Horloge` (interface), `SystemClock` (classe).

- [ ] **Step 1 : Déplacer `execution-differee` et `url-applicative`, sans changement de contenu.**

```bash
mkdir -p src/backend/platform/execution-differee src/backend/platform/http
git mv src/lib/run-after.ts src/backend/platform/execution-differee/execution-differee.ts
git mv src/lib/app-url.ts src/backend/platform/http/url-applicative.ts
node scripts/dev/remplacer-imports.mjs "@/lib/run-after" "@/backend/platform/execution-differee/execution-differee"
node scripts/dev/remplacer-imports.mjs "@/lib/app-url" "@/backend/platform/http/url-applicative"
git diff --stat
```

- [ ] **Step 2 : Finir le déplacement de `clientIp` et supprimer `src/lib/rate-limit.ts`.**

Lire ce qui reste de `src/lib/rate-limit.ts` après la Tâche 2 (seulement `clientIp` et son commentaire). Créer `src/backend/platform/http/adresse-client.ts` avec exactement ce contenu (fonction `clientIp(req: Request): string`, inchangée), puis :

```bash
git rm src/lib/rate-limit.ts
node scripts/dev/remplacer-imports.mjs "@/lib/rate-limit" "@/backend/platform/http/adresse-client"
git diff --stat
```

Relire le diff : vérifier qu'il ne reste plus aucune référence à `@/lib/rate-limit` (`grep -rl "@/lib/rate-limit" src tests` doit être vide) et que les importeurs de `consumeRateLimit` (déplacé à la Tâche 2 vers `@/backend/platform/limiteur-debit/rate-limit`) n'ont pas été touchés par ce dernier codemod.

- [ ] **Step 3 : `Horloge` — nouveau, TDD.**

```ts
// src/backend/platform/horloge/horloge.test.ts
import { describe, it, expect } from "vitest";
import { SystemClock } from "./horloge";

describe("SystemClock", () => {
  it("renvoie une Date proche de l'instant présent", () => {
    const avant = Date.now();
    const maintenant = new SystemClock().maintenant();
    const apres = Date.now();
    expect(maintenant).toBeInstanceOf(Date);
    expect(maintenant.getTime()).toBeGreaterThanOrEqual(avant);
    expect(maintenant.getTime()).toBeLessThanOrEqual(apres);
  });

  it("renvoie une nouvelle Date à chaque appel", async () => {
    const horloge = new SystemClock();
    const t1 = horloge.maintenant();
    await new Promise((r) => setTimeout(r, 5));
    const t2 = horloge.maintenant();
    expect(t2.getTime()).toBeGreaterThan(t1.getTime());
  });
});
```

Run : `npx vitest run src/backend/platform/horloge` → FAIL (module absent). Puis :

```ts
// src/backend/platform/horloge/horloge.ts
/**
 * Port d'horloge : permet aux cas d'usage de dépendre du temps sans appeler `new Date()`
 * directement, pour être testables avec une horloge fixe ou avançant pas à pas.
 */
export interface Horloge {
  maintenant(): Date;
}

export class SystemClock implements Horloge {
  maintenant(): Date {
    return new Date();
  }
}
```

Run : `npx vitest run src/backend/platform/horloge` → PASS. `Horloge`/`SystemClock` ne sont consommés par aucun autre module à ce stade (aucun appelant à mettre à jour) : ils seront utilisés par `comptes` (3b, validité des jetons) et plus tard par `operations` (R4, conflits/statuts) — YAGNI respecté, rien d'autre à câbler ici.

- [ ] **Step 4 : Vérifier**

Run: `npx tsc --noEmit && npm run lint 2>&1 | tail -1 && npx vitest run 2>&1 | grep -E "Test Files|Tests "`
Expected : tout vert ; `tests/unit/{run-after,app-url}.test.ts` et `tests/integration/rate-limit.test.ts` passent avec seulement des changements de chemins d'import ; les routes `auth/forgot-password`, `auth/reset-password`, `users`, `users/[id]/send-reset-link`, `mail/test` compilent (imports à jour pour `runAfterResponse`, `clientIp`, `appBaseUrl`, `consumeRateLimit`). Puis `verifier-build` (plan maître) → succès.

- [ ] **Step 5 : Commit**

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports' ':!package.json'
git status --short | head -20
git commit -m "refactor(platform): exécution différée, adresse client, URL applicative déplacées ; horloge (nouveau)"
```

---

### Task 4 : Documentation, statuts et revue du sous-jalon

**Files:** `README.md`, `docs/superpowers/plans/2026-09-20-refactor-architecture-master.md`, `docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md`

- [ ] **Step 1 : README.** Section « Architecture » : mentionner que `platform/` couvre désormais aussi `email/`, `limiteur-debit/`, `execution-differee/`, `horloge/`, en plus de `base-de-donnees/` et `http/` ; vérifier que chaque chemin cité existe. Ne pas ajouter `comptes` à la liste des domaines migrés (seul le socle transverse l'est — les cas d'usage restent dans `src/lib/{auth,api-auth.ts,...}` jusqu'à 3b/3c).
- [ ] **Step 2 : Statuts.** Plan maître : la ligne R3 passe de « À détailler » à **« En cours (3a réalisé ; 3b, 3c à venir) »** — ne pas marquer R3 « Réalisé », ce jalon n'est qu'un tiers du travail. Ajouter dans « Enseignements » : « R3a : les briques transverses déjà isolées en `src/lib/` (e-mail, limiteur de débit, exécution différée) se déplacent sans aucune réécriture, seuls les chemins changent ; `platform/` n'a pas de séparation domain/application (ce n'est pas un domaine métier) ; `Horloge`/`SystemClock` introduits par anticipation de 3b et R4, non consommés avant. »
- [ ] **Step 3 : Vérification complète** : `npx tsc --noEmit && npm run lint && npx vitest run`, puis `verifier-build`.
- [ ] **Step 4 : Non-régression ciblée** (à consigner dans le rapport) : `git diff main --stat -- tests/unit tests/integration` — les tests existants ne changent que par des chemins d'import (lister tout autre changement) ; pour les routes qui consomment ces modules (`auth/forgot-password`, `auth/reset-password`, `users`, `users/[id]/send-reset-link`, `mail/test`), comparer les réponses JSON avant/après avec la méthode de R0-R2 (archive de `main` et de la branche, même sonde, corps bruts) sur au moins : mot de passe oublié (200 et limite de débit atteinte, 429), réinitialisation (200/400), envoi de lien (200), route de test e-mail (200/503 selon transport).
- [ ] **Step 5 : Commit**

```bash
git add README.md docs/superpowers
git commit -m "docs: statuts du sous-jalon R3a (socle plateforme de comptes)"
```

- [ ] **Step 6 : Revue du jalon** — **effectuée par le contrôleur** (revue finale de branche complète, modèle le plus capable ; ne pas la dispatcher comme tâche), comme pour R1 et R2. Critères : aucun changement de comportement sur les cinq modules ; noms d'exports inchangés ; `Horloge`/`SystemClock` corrects et non intrusifs (aucun appelant cassé) ; `enregistrement-modeles.ts` non modifié (confirmé qu'aucun ajout n'était nécessaire) ; aucun import résiduel vers `@/lib/mail`, `@/lib/rate-limit`, `@/lib/run-after`, `@/lib/app-url` ; `package.json` absent de tous les commits ; CI verte sur clone propre. **Vu le caractère « sensible » de `comptes`, vérifier explicitly qu'aucun secret (SMTP, jetons) n'a été journalisé ou introduit en clair dans un test ou un commentaire pendant ce sous-plan.**

---

## Auto-relecture

- **Couverture de la spec (sous-jalon 3a) :** `email` (tâche 1), `limiteur-debit` (tâche 2), `execution-differee` + `horloge` + `http` (tâche 3), documentation et revue (tâche 4). `comptes` lui-même (cas d'usage, NextAuth, `Acteur`, gardes) est explicitement hors périmètre — 3b et 3c.
- **Cohérence des noms :** tous les exports publics (`sendMail`, `resolveTransport`, `getMemoryTransport`, `consumeRateLimit`, `RateLimitResult`, `runAfterResponse`, `clientIp`, `appBaseUrl`, `AppUrlError`, `Horloge`, `SystemClock`) sont définis à la tâche qui les déplace/crée et ne sont jamais renommés ailleurs dans le plan.
- **Points de vigilance :** (1) l'ordre des codemods à la tâche 2 est délicat (`consumeRateLimit` quitte `src/lib/rate-limit.ts` avant que `clientIp` n'en parte à la tâche 3) — l'exécutant doit vérifier `grep` à chaque étape plutôt que supposer que le script générique a tout couvert correctement ; (2) le modèle `RateLimit` n'a jamais eu besoin d'être dans `enregistrement-modeles.ts` (pas de `populate` le référençant) — ne pas l'y ajouter par réflexe ; (3) `Horloge`/`SystemClock` n'ont aucun appelant dans ce sous-plan, c'est intentionnel (introduits pour 3b/R4) ; (4) `package.json` ne doit jamais être staged (leçon du jalon R2) — la commande `git add` de ce plan l'exclut explicitement partout.
