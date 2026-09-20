# Lot 1A — Fuites d'accès et mot de passe : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fermer toutes les fuites d'accès connues entre les cinq rôles (pages et API), rendre les comptes `client` et `chauffeur` cohérents, et imposer le changement du mot de passe temporaire.

**Architecture:** Une matrice d'accès unique par chemin (`lib/page-access.ts`) alimente à la fois la protection des pages serveur, le menu et les tests. Côté API, les gardes existantes de `lib/api-auth.ts` sont durcies (chauffeur refusé par défaut hors de son équipe, référentiels réservés au personnel). Le JWT est rafraîchi depuis la base pour refléter les changements de rôle et le drapeau `mustChangePassword`.

**Tech Stack:** Next.js 16 (App Router, composants serveur), NextAuth v4 (JWT), Mongoose, Zod, Vitest + mongodb-memory-server.

**Spec:** `docs/superpowers/plans/2026-09-20-lot1-master.md` (défauts A1 à A6, section 1) ; matrice des rôles ci-dessous.

## Global Constraints

- Le client s'appelle **SRH**. Interface et messages en français.
- Rôles : `admin`, `dispatcher`, `lecture`, `chauffeur`, `client` (`lib/permissions.ts`, `types/index.ts`).
- Statuts exacts : `Planifiée → Affectée → En route → En cours → Terminée → Rapportée` (+ `Retardée`, `Annulée`).
- Aucun secret ni identifiant de base dans Git ; ne jamais lancer `npm run build`, `npm run seed` ou `scripts/seed-admin.ts` sans `--on-build` (le `.env.local` contient une base réelle) ; aucun mot de passe dans les logs.
- Un test qui protège un contrôle d'accès doit vérifier le **code de réponse ET l'état en base** (pas seulement le code).
- Ne jamais stager `.agents/`, `.claude/`, `skills-lock.json`, `rapports/`, `data/`, `.superpowers/`.
- État de départ : `main` à `a0afda6` ou après ; 123 tests verts ; `tsc` propre ; lint 0 erreur (9 avertissements connus).

### Matrice d'accès (référence unique)

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

Un chemin absent de la matrice est **refusé** (refus par défaut). Un accès refusé redirige vers la page d'accueil du rôle.

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `lib/page-access.ts` (créer) | Matrice chemin → rôles, `canAccessPath`, `homePathFor` (fonctions pures) |
| `lib/page-auth.ts` (créer) | `requirePageAccess(pathname)` pour les composants serveur (session, redirections, mot de passe à changer) |
| `lib/nav.ts` (créer) | Données du menu + `navForRole(role)` filtrées par `canAccessPath` |
| `lib/users/scope.ts` (créer) | Vérifie que `clientId` / `equipeId` d'un compte existent |
| `lib/auth-refresh.ts` (créer) | Recharge rôle, client, équipe et `mustChangePassword` depuis la base pour le JWT |
| `app/(dashboard)/acces-limite/page.tsx` (créer) | Page d'attente pour les comptes `client` |
| `app/(dashboard)/**/page.tsx` (modifier) | Appel à `requirePageAccess` |
| `components/layout/Sidebar.tsx` (modifier) | Consomme `lib/nav.ts` |
| `lib/validators/user.ts` (modifier) | Cohérence rôle ↔ `clientId` / `equipeId`, identifiants Mongo valides |
| `app/api/users/route.ts`, `app/api/users/[id]/route.ts` (modifier) | Vérification d'existence, retrait de `clientId` / `equipeId` à la mise à jour |
| `lib/api-auth.ts` (modifier) | Chauffeur refusé par défaut, référentiels réservés au personnel, `mustChangePassword` |
| `lib/auth.ts` (modifier) | Rafraîchissement du JWT |
| `app/(dashboard)/profil/page.tsx` (modifier) | Changement forcé du mot de passe |

Chaque tâche produit un livrable testable seul ; les tâches 1 à 3 peuvent être relues indépendamment de 4 à 6.

---

### Task 1: Matrice d'accès des pages

**Files:**
- Create: `lib/page-access.ts`
- Test: `tests/unit/page-access.test.ts`

**Interfaces:**
- Produces:
  - `canAccessPath(role: string | null | undefined, pathname: string): boolean`
  - `homePathFor(role: string | null | undefined): string` — `"/terrain"` pour `chauffeur`, `"/acces-limite"` pour `client`, `"/"` sinon (y compris rôle inconnu).

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// tests/unit/page-access.test.ts
import { describe, it, expect } from "vitest";
import { canAccessPath, homePathFor } from "@/lib/page-access";
import { USER_ROLES } from "@/types";

const ID = "507f1f77bcf86cd799439011";
const STAFF = ["admin", "dispatcher", "lecture"];
const WRITERS = ["admin", "dispatcher"];

// [chemin, rôles autorisés] — miroir de la matrice du plan.
const EXPECTED: Array<[string, string[]]> = [
  ["/", STAFF],
  ["/operations", STAFF],
  ["/operations/planning", STAFF],
  ["/operations/nouveau", WRITERS],
  [`/operations/${ID}`, [...STAFF, "chauffeur"]],
  ["/recurrences", STAFF],
  ["/clients", STAFF],
  ["/equipes", STAFF],
  ["/vehicules", STAFF],
  ["/equipements", STAFF],
  ["/import", WRITERS],
  ["/utilisateurs", ["admin"]],
  ["/terrain", ["admin", "dispatcher", "chauffeur"]],
  ["/profil", [...USER_ROLES]],
  ["/acces-limite", ["client"]],
];

describe("canAccessPath", () => {
  for (const [path, allowed] of EXPECTED) {
    for (const role of USER_ROLES) {
      it(`${role} ${allowed.includes(role) ? "peut" : "ne peut pas"} ouvrir ${path}`, () => {
        expect(canAccessPath(role, path)).toBe(allowed.includes(role));
      });
    }
  }

  it("refuse un chemin absent de la matrice, pour tous les rôles", () => {
    for (const role of USER_ROLES) {
      expect(canAccessPath(role, "/inconnu")).toBe(false);
      expect(canAccessPath(role, "/utilisateurs-secrets")).toBe(false);
    }
  });

  it("refuse un rôle absent ou inconnu", () => {
    expect(canAccessPath(undefined, "/")).toBe(false);
    expect(canAccessPath(null, "/")).toBe(false);
    expect(canAccessPath("root", "/")).toBe(false);
  });

  it("ignore la query string et le slash final", () => {
    expect(canAccessPath("lecture", "/clients/")).toBe(true);
    expect(canAccessPath("lecture", "/clients?x=1")).toBe(true);
    expect(canAccessPath("lecture", "/import/?x=1")).toBe(false);
  });

  it("n'autorise pas un identifiant d'opération mal formé pour le chauffeur", () => {
    expect(canAccessPath("chauffeur", "/operations/abc")).toBe(false);
    expect(canAccessPath("chauffeur", `/operations/${ID}/extra`)).toBe(false);
  });
});

describe("homePathFor", () => {
  it("renvoie l'accueil de chaque rôle", () => {
    expect(homePathFor("admin")).toBe("/");
    expect(homePathFor("dispatcher")).toBe("/");
    expect(homePathFor("lecture")).toBe("/");
    expect(homePathFor("chauffeur")).toBe("/terrain");
    expect(homePathFor("client")).toBe("/acces-limite");
    expect(homePathFor(undefined)).toBe("/");
  });

  it("renvoie toujours une page que le rôle a le droit d'ouvrir (pas de boucle de redirection)", () => {
    for (const role of USER_ROLES) {
      expect(canAccessPath(role, homePathFor(role))).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `npx vitest run tests/unit/page-access.test.ts`
Expected: FAIL — `Cannot find module '@/lib/page-access'`.

- [ ] **Step 3: Implémenter**

```ts
// lib/page-access.ts
import type { UserRole } from "@/types";

/**
 * Matrice d'accès aux pages du tableau de bord : source unique pour la
 * protection des pages serveur, le menu et les tests. Refus par défaut : un
 * chemin absent de la matrice n'est ouvert à personne.
 */
const STAFF: UserRole[] = ["admin", "dispatcher", "lecture"];
const WRITERS: UserRole[] = ["admin", "dispatcher"];
const ALL: UserRole[] = ["admin", "dispatcher", "lecture", "chauffeur", "client"];

interface AccessRule {
  matches: (path: string) => boolean;
  roles: UserRole[];
}

const under = (base: string) => (path: string) => path === base || path.startsWith(`${base}/`);
const OPERATION_DETAIL = /^\/operations\/[a-f\d]{24}$/i;

// L'ordre compte : la première règle qui correspond s'applique.
const RULES: AccessRule[] = [
  { matches: (p) => p === "/", roles: STAFF },
  { matches: under("/utilisateurs"), roles: ["admin"] },
  { matches: under("/import"), roles: WRITERS },
  { matches: under("/operations/nouveau"), roles: WRITERS },
  { matches: (p) => OPERATION_DETAIL.test(p), roles: [...STAFF, "chauffeur"] },
  { matches: under("/operations"), roles: STAFF },
  { matches: under("/recurrences"), roles: STAFF },
  { matches: under("/clients"), roles: STAFF },
  { matches: under("/equipes"), roles: STAFF },
  { matches: under("/vehicules"), roles: STAFF },
  { matches: under("/equipements"), roles: STAFF },
  { matches: under("/terrain"), roles: ["admin", "dispatcher", "chauffeur"] },
  { matches: under("/profil"), roles: ALL },
  { matches: under("/acces-limite"), roles: ["client"] },
];

function normalize(pathname: string): string {
  const withoutQuery = pathname.split("?")[0].split("#")[0];
  const trimmed = withoutQuery.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export function canAccessPath(role: string | null | undefined, pathname: string): boolean {
  if (!role) return false;
  const path = normalize(pathname);
  const rule = RULES.find((r) => r.matches(path));
  return Boolean(rule && (rule.roles as string[]).includes(role));
}

export function homePathFor(role: string | null | undefined): string {
  if (role === "chauffeur") return "/terrain";
  if (role === "client") return "/acces-limite";
  return "/";
}
```

- [ ] **Step 4: Relancer**

Run: `npx vitest run tests/unit/page-access.test.ts`
Expected: PASS (toutes les combinaisons).

- [ ] **Step 5: Commit**

```bash
git add lib/page-access.ts tests/unit/page-access.test.ts
git commit -m "feat(acces): matrice d'accès unique des pages par rôle"
```

---

### Task 2: Protection des pages serveur

**Files:**
- Create: `lib/page-auth.ts`, `app/(dashboard)/acces-limite/page.tsx`
- Modify: `app/(dashboard)/page.tsx`, `app/(dashboard)/clients/page.tsx`, `equipements/page.tsx`, `equipes/page.tsx`, `import/page.tsx`, `operations/page.tsx`, `operations/nouveau/page.tsx`, `operations/planning/page.tsx`, `operations/[id]/page.tsx`, `recurrences/page.tsx`, `terrain/page.tsx`, `utilisateurs/page.tsx`, `vehicules/page.tsx`
- Test: `tests/unit/page-auth.test.ts`, `tests/unit/page-guards.test.ts`

**Interfaces:**
- Consumes: `canAccessPath`, `homePathFor` (Task 1) ; `authOptions` (`lib/auth.ts`).
- Produces: `requirePageAccess(pathname: string): Promise<Session>` — redirige vers `/login` sans session, vers `homePathFor(role)` si le chemin est refusé ; renvoie la session sinon.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// tests/unit/page-auth.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { requirePageAccess } from "@/lib/page-auth";

function session(role: string) {
  vi.mocked(nextAuth.getServerSession).mockResolvedValue({
    user: { id: "507f1f77bcf86cd799439011", name: "T", email: "t@srh.ci", username: "t", role },
  } as never);
}

describe("requirePageAccess", () => {
  beforeEach(() => vi.resetAllMocks());

  it("redirige vers /login sans session", async () => {
    vi.mocked(nextAuth.getServerSession).mockResolvedValue(null as never);
    await expect(requirePageAccess("/")).rejects.toThrow("REDIRECT:/login");
  });

  it("renvoie la session quand le chemin est autorisé", async () => {
    session("admin");
    await expect(requirePageAccess("/utilisateurs")).resolves.toMatchObject({
      user: { role: "admin" },
    });
  });

  it.each([
    ["dispatcher", "/utilisateurs", "/"],
    ["lecture", "/import", "/"],
    ["lecture", "/operations/nouveau", "/"],
    ["chauffeur", "/", "/terrain"],
    ["chauffeur", "/clients", "/terrain"],
    ["client", "/", "/acces-limite"],
    ["client", "/operations", "/acces-limite"],
    ["client", "/terrain", "/acces-limite"],
  ])("%s ouvrant %s est redirigé vers %s", async (role, path, home) => {
    session(role);
    await expect(requirePageAccess(path)).rejects.toThrow(`REDIRECT:${home}`);
  });
});
```

```ts
// tests/unit/page-guards.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "app", "(dashboard)");

// /profil est un composant client : l'authentification est assurée par le middleware
// et la page est ouverte à tous les rôles.
const EXEMPT = new Set(["profil/page.tsx"]);

describe("pages du tableau de bord", () => {
  const pages = (readdirSync(ROOT, { recursive: true }) as string[])
    .map((p) => p.split(path.sep).join("/"))
    .filter((p) => p === "page.tsx" || p.endsWith("/page.tsx"));

  it("en trouve plus d'une dizaine (le test ne doit pas passer à vide)", () => {
    expect(pages.length).toBeGreaterThanOrEqual(13);
  });

  it.each(pages.filter((p) => !EXEMPT.has(p)))("%s appelle requirePageAccess", (page) => {
    const source = readFileSync(path.join(ROOT, page), "utf8");
    expect(source).toContain("requirePageAccess(");
  });
});
```

- [ ] **Step 2: Lancer**

Run: `npx vitest run tests/unit/page-auth.test.ts tests/unit/page-guards.test.ts`
Expected: FAIL (`lib/page-auth` absent ; les pages n'appellent pas encore la garde).

- [ ] **Step 3: Implémenter `lib/page-auth.ts`**

```ts
// lib/page-auth.ts
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canAccessPath, homePathFor } from "@/lib/page-access";

/**
 * À appeler en tête de chaque page serveur du tableau de bord, avant toute
 * lecture de données. `redirect` interrompt le rendu : le code qui suit ne
 * s'exécute jamais pour un rôle refusé.
 */
export async function requirePageAccess(pathname: string): Promise<Session> {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  if (!canAccessPath(role, pathname)) redirect(homePathFor(role));

  return session;
}
```

- [ ] **Step 4: Créer la page d'attente des comptes client**

```tsx
// app/(dashboard)/acces-limite/page.tsx
import { requirePageAccess } from "@/lib/page-auth";

export default async function AccesLimitePage() {
  await requirePageAccess("/acces-limite");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-margin-mobile py-gutter-md lg:px-margin-desktop">
      <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface lg:font-headline-lg lg:text-headline-lg">
        Espace client SRH
      </h1>
      <p className="font-body-md text-body-md text-on-surface-variant">
        Votre compte est actif. Le suivi de vos collectes et de vos rapports sera
        disponible prochainement. En attendant, contactez votre interlocuteur SRH
        pour toute demande.
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Protéger chaque page.** Ajouter l'import `import { requirePageAccess } from "@/lib/page-auth";` et, en première instruction du composant (le rendre `async` s'il ne l'est pas), l'appel ci-dessous. Chemins à passer, page par page :

| Page | Appel |
|---|---|
| `app/(dashboard)/page.tsx` (`DashboardPage`, avant `getDashboardData()`) | `await requirePageAccess("/");` |
| `clients/page.tsx` | `await requirePageAccess("/clients");` |
| `equipements/page.tsx` | `await requirePageAccess("/equipements");` |
| `equipes/page.tsx` | `await requirePageAccess("/equipes");` |
| `import/page.tsx` | `await requirePageAccess("/import");` |
| `operations/page.tsx` | `await requirePageAccess("/operations");` |
| `operations/nouveau/page.tsx` | `await requirePageAccess("/operations/nouveau");` |
| `operations/planning/page.tsx` | `await requirePageAccess("/operations/planning");` |
| `operations/[id]/page.tsx` | `const { id } = await params; await requirePageAccess(\`/operations/${id}\`);` (conserver l'usage existant de `params`) |
| `recurrences/page.tsx` | `await requirePageAccess("/recurrences");` |
| `terrain/page.tsx` | `await requirePageAccess("/terrain");` |
| `utilisateurs/page.tsx` | `await requirePageAccess("/utilisateurs");` |
| `vehicules/page.tsx` | `await requirePageAccess("/vehicules");` |

Exemple complet (`clients/page.tsx`) :

```tsx
import { ClientsPageClient } from "@/components/clients/ClientsPageClient";
import { requirePageAccess } from "@/lib/page-auth";

export default async function ClientsPage() {
  await requirePageAccess("/clients");
  return <ClientsPageClient />;
}
```

Pour `operations/[id]/page.tsx`, lire d'abord le fichier : si `params` est déjà attendu (`await params`), réutiliser cette variable ; sinon typer `params: Promise<{ id: string }>` (Next 16).

- [ ] **Step 6: Relancer les tests, tsc et lint**

Run: `npx vitest run tests/unit/page-auth.test.ts tests/unit/page-guards.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS, `tsc` propre, 0 erreur de lint.

- [ ] **Step 7: Suite complète puis commit**

Run: `npx vitest run` → tout vert (123 + nouveaux).

```bash
git add lib/page-auth.ts "app/(dashboard)" tests/unit/page-auth.test.ts tests/unit/page-guards.test.ts
git commit -m "feat(acces): pages serveur protégées par la matrice d'accès (dont l'accueil)"
```

---

### Task 3: Menu issu de la matrice d'accès

**Files:**
- Create: `lib/nav.ts`
- Modify: `components/layout/Sidebar.tsx`
- Test: `tests/unit/nav.test.ts`

**Interfaces:**
- Consumes: `canAccessPath` (Task 1).
- Produces:
  - `interface NavItem { href: string; label: string; icon: string; match?: (path: string) => boolean }`
  - `interface NavSection { title?: string; items: NavItem[] }`
  - `navForRole(role: string | null | undefined): NavSection[]` — sections filtrées, sans section vide.

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// tests/unit/nav.test.ts
import { describe, it, expect } from "vitest";
import { navForRole } from "@/lib/nav";

const hrefs = (role: string) => navForRole(role).flatMap((s) => s.items.map((i) => i.href));

describe("navForRole", () => {
  it("admin voit tout, dont Utilisateurs et Import", () => {
    const h = hrefs("admin");
    expect(h).toEqual(
      expect.arrayContaining(["/", "/terrain", "/operations/planning", "/operations", "/recurrences", "/import", "/clients", "/equipes", "/vehicules", "/equipements", "/utilisateurs"])
    );
  });

  it("dispatcher voit l'import mais pas les utilisateurs", () => {
    const h = hrefs("dispatcher");
    expect(h).toContain("/import");
    expect(h).not.toContain("/utilisateurs");
  });

  it("lecture ne voit ni la console terrain, ni l'import, ni les utilisateurs", () => {
    const h = hrefs("lecture");
    expect(h).toContain("/operations");
    expect(h).not.toContain("/terrain");
    expect(h).not.toContain("/import");
    expect(h).not.toContain("/utilisateurs");
  });

  it("chauffeur ne voit que la console terrain", () => {
    expect(hrefs("chauffeur")).toEqual(["/terrain"]);
  });

  it("client ne voit aucune entrée de menu (sa page d'attente s'ouvre à la connexion)", () => {
    expect(hrefs("client")).toEqual([]);
    expect(navForRole("client")).toEqual([]);
  });

  it("rôle inconnu : rien", () => {
    expect(navForRole(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer** — `npx vitest run tests/unit/nav.test.ts` → FAIL (`lib/nav` absent).

- [ ] **Step 3: Implémenter `lib/nav.ts`.** Déplacer depuis `components/layout/Sidebar.tsx` (lignes ~11 à 100) les interfaces et le tableau `NAV_SECTIONS` **à l'identique** (mêmes libellés, icônes, `match`), en **supprimant la propriété `roles`** de chaque entrée, puis ajouter :

```ts
// lib/nav.ts (en fin de fichier)
import { canAccessPath } from "@/lib/page-access";

export function navForRole(role: string | null | undefined): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => canAccessPath(role, item.href)),
  })).filter((section) => section.items.length > 0);
}
```

(`NAV_SECTIONS` reste non exporté ou exporté pour l'usage interne, au choix ; `NavItem` et `NavSection` sont exportés.)

- [ ] **Step 4: Adapter `Sidebar.tsx`** : supprimer les définitions déplacées, importer `import { navForRole } from "@/lib/nav";` et remplacer le bloc

```tsx
{NAV_SECTIONS.map((section, si) => {
  const visibleItems = section.items.filter(
    (item) => !item.roles || (userRole && item.roles.includes(userRole))
  );
  if (visibleItems.length === 0) return null;
  ...
```

par un parcours de `navForRole(userRole).map((section, si) => …)` en réutilisant `section.items` à la place de `visibleItems` (le rendu des entrées reste identique). `isActive(pathname, item)` reste dans `Sidebar.tsx`. Le bloc profil en bas du menu reste visible pour tous les rôles.

- [ ] **Step 5: Vérifier** — `npx vitest run tests/unit/nav.test.ts && npx tsc --noEmit && npm run lint` → PASS. Ouvrir l'application en développement pour un contrôle visuel n'est pas requis ici (le rendu est inchangé pour admin/dispatcher).

- [ ] **Step 6: Commit**

```bash
git add lib/nav.ts components/layout/Sidebar.tsx tests/unit/nav.test.ts
git commit -m "feat(acces): menu dérivé de la matrice d'accès"
```

---

### Task 4: Comptes cohérents (rôle ↔ client / équipe)

**Files:**
- Modify: `lib/validators/user.ts`, `app/api/users/route.ts`, `app/api/users/[id]/route.ts`, `tests/integration/users-auth.test.ts` (adapter les cas qui créent un chauffeur ou un client sans rattachement)
- Create: `lib/users/scope.ts`
- Test: `tests/unit/user-validators.test.ts`, `tests/integration/users-scope.test.ts`

**Interfaces:**
- Consumes: `objectIdSchema`, `optionalObjectIdSchema` (`lib/validators/object-id.ts`).
- Produces: `findScopeError(input: { clientId?: string; equipeId?: string }): Promise<string | null>` — message français si le client ou l'équipe n'existe pas, `null` sinon.

Règles : `client` → `clientId` obligatoire et pas d'`equipeId` ; `chauffeur` → `equipeId` obligatoire et pas de `clientId` ; les autres rôles → ni l'un ni l'autre. Chaîne vide = « non renseigné ».

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// tests/unit/user-validators.test.ts
import { describe, it, expect } from "vitest";
import { userCreateSchema, userUpdateSchema } from "@/lib/validators/user";

const ID = "507f1f77bcf86cd799439011";
const base = { username: "jean_k", nom: "Jean K", email: "jean@srh.ci", telephone: "" };

const issues = (r: { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => `${i.path.join(".")}:${i.message}`);

describe.each([
  ["création", userCreateSchema],
  ["mise à jour", userUpdateSchema],
])("validateur d'utilisateur (%s)", (_name, schema) => {
  it("exige un clientId pour un compte client", () => {
    expect(issues(schema.safeParse({ ...base, role: "client" }))).toContainEqual(
      expect.stringContaining("clientId:")
    );
  });

  it("exige une équipe pour un chauffeur", () => {
    expect(issues(schema.safeParse({ ...base, role: "chauffeur" }))).toContainEqual(
      expect.stringContaining("equipeId:")
    );
  });

  it("refuse un identifiant qui n'est pas un ObjectId", () => {
    expect(schema.safeParse({ ...base, role: "client", clientId: "pas-un-id" }).success).toBe(false);
    expect(schema.safeParse({ ...base, role: "chauffeur", equipeId: "123" }).success).toBe(false);
  });

  it("accepte un client rattaché et un chauffeur rattaché", () => {
    expect(schema.safeParse({ ...base, role: "client", clientId: ID }).success).toBe(true);
    expect(schema.safeParse({ ...base, role: "chauffeur", equipeId: ID }).success).toBe(true);
  });

  it("refuse un rattachement étranger au rôle", () => {
    expect(schema.safeParse({ ...base, role: "dispatcher", clientId: ID }).success).toBe(false);
    expect(schema.safeParse({ ...base, role: "lecture", equipeId: ID }).success).toBe(false);
    expect(schema.safeParse({ ...base, role: "client", clientId: ID, equipeId: ID }).success).toBe(false);
    expect(schema.safeParse({ ...base, role: "chauffeur", equipeId: ID, clientId: ID }).success).toBe(false);
  });

  it("traite la chaîne vide comme « non renseigné »", () => {
    const r = schema.safeParse({ ...base, role: "dispatcher", clientId: "", equipeId: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.clientId).toBeUndefined();
      expect(r.data.equipeId).toBeUndefined();
    }
  });
});
```

```ts
// tests/integration/users-scope.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { POST as createUser } from "@/app/api/users/route";
import { PUT as updateUser } from "@/app/api/users/[id]/route";
import { Client } from "@/models/Client";
import { Equipe } from "@/models/Equipe";
import { User } from "@/models/User";

function asAdmin() {
  vi.mocked(nextAuth.getServerSession).mockResolvedValue({
    user: { id: "507f1f77bcf86cd799439011", name: "Admin", email: "a@srh.ci", username: "admin", role: "admin" },
  } as never);
}

const create = (body: Record<string, unknown>) =>
  createUser(new NextRequest("http://localhost:3000/api/users", { method: "POST", body: JSON.stringify(body) }));

const base = { nom: "Jean K", telephone: "" };

describe("rattachement des comptes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    asAdmin();
  });

  it("refuse un compte client sans clientId et ne crée rien", async () => {
    const res = await create({ ...base, username: "cli1", email: "cli1@srh.ci", role: "client" });
    expect(res.status).toBe(400);
    expect(await User.countDocuments({ username: "cli1" })).toBe(0);
  });

  it("refuse un clientId qui n'existe pas", async () => {
    const res = await create({ ...base, username: "cli2", email: "cli2@srh.ci", role: "client", clientId: "507f1f77bcf86cd799439099" });
    expect(res.status).toBe(400);
    expect(await User.countDocuments({ username: "cli2" })).toBe(0);
  });

  it("crée un compte client rattaché à un client existant", async () => {
    const client = await Client.create({ nom: "Client A" });
    const res = await create({ ...base, username: "cli3", email: "cli3@srh.ci", role: "client", clientId: String(client._id) });
    expect(res.status).toBe(201);
    const user = await User.findOne({ username: "cli3" });
    expect(String(user?.clientId)).toBe(String(client._id));
  });

  it("refuse un chauffeur sans équipe, ou avec une équipe inconnue", async () => {
    const r1 = await create({ ...base, username: "ch1", email: "ch1@srh.ci", role: "chauffeur" });
    const r2 = await create({ ...base, username: "ch2", email: "ch2@srh.ci", role: "chauffeur", equipeId: "507f1f77bcf86cd799439099" });
    expect(r1.status).toBe(400);
    expect(r2.status).toBe(400);
    expect(await User.countDocuments({ username: { $in: ["ch1", "ch2"] } })).toBe(0);
  });

  it("crée un chauffeur rattaché à une équipe existante", async () => {
    const equipe = await Equipe.create({ nom: "Équipe 1" });
    const res = await create({ ...base, username: "ch3", email: "ch3@srh.ci", role: "chauffeur", equipeId: String(equipe._id) });
    expect(res.status).toBe(201);
  });

  it("à la mise à jour, changer un client en dispatcher retire son rattachement en base", async () => {
    const client = await Client.create({ nom: "Client B" });
    const user = await User.create({
      username: "cli4", nom: "Cli 4", email: "cli4@srh.ci", motDePasseHash: "x",
      role: "client", clientId: client._id,
    });

    const res = await updateUser(
      new NextRequest(`http://localhost:3000/api/users/${user._id}`, {
        method: "PUT",
        body: JSON.stringify({ nom: "Cli 4", email: "cli4@srh.ci", role: "dispatcher", telephone: "", clientId: "" }),
      }),
      { params: Promise.resolve({ id: String(user._id) }) }
    );

    expect(res.status).toBe(200);
    const after = await User.findById(user._id).lean();
    expect(after?.role).toBe("dispatcher");
    expect(after?.clientId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Lancer** — `npx vitest run tests/unit/user-validators.test.ts tests/integration/users-scope.test.ts` → FAIL (les validateurs acceptent tout ; la mise à jour ne retire pas `clientId`).

- [ ] **Step 3: Implémenter le validateur** (`lib/validators/user.ts`) — remplacer `userCreateSchema` et `userUpdateSchema` :

```ts
import { z } from "zod";
import { USER_ROLES } from "@/types";
import { optionalObjectIdSchema } from "@/lib/validators/object-id";

const emptyToUndefined = (v: string | undefined) => (v ? v : undefined);

const scopedFields = {
  clientId: optionalObjectIdSchema("Identifiant de client invalide").transform(emptyToUndefined),
  equipeId: optionalObjectIdSchema("Identifiant d'équipe invalide").transform(emptyToUndefined),
};

function checkRoleScope(
  data: { role: string; clientId?: string; equipeId?: string },
  ctx: z.RefinementCtx
) {
  if (data.role === "client" && !data.clientId) {
    ctx.addIssue({ code: "custom", path: ["clientId"], message: "Un compte client doit être rattaché à un client" });
  }
  if (data.role !== "client" && data.clientId) {
    ctx.addIssue({ code: "custom", path: ["clientId"], message: "Seul un compte client peut être rattaché à un client" });
  }
  if (data.role === "chauffeur" && !data.equipeId) {
    ctx.addIssue({ code: "custom", path: ["equipeId"], message: "Un chauffeur doit être rattaché à une équipe" });
  }
  if (data.role !== "chauffeur" && data.equipeId) {
    ctx.addIssue({ code: "custom", path: ["equipeId"], message: "Seul un chauffeur peut être rattaché à une équipe" });
  }
}

export const userCreateSchema = z
  .object({
    username: z
      .string()
      .min(3, "Le nom d'utilisateur doit contenir au moins 3 caractères")
      .regex(/^[a-zA-Z0-9_.-]+$/, "Caractères autorisés: lettres, chiffres, _, ., -"),
    nom: z.string().min(2, "Le nom est requis"),
    email: z.string().email("Adresse email invalide"),
    role: z.enum(USER_ROLES as [string, ...string[]]),
    telephone: z.string().optional().default(""),
    ...scopedFields,
  })
  .superRefine(checkRoleScope);

export const userUpdateSchema = z
  .object({
    nom: z.string().min(2, "Le nom est requis"),
    email: z.string().email("Adresse email invalide"),
    role: z.enum(USER_ROLES as [string, ...string[]]),
    telephone: z.string().optional().default(""),
    ...scopedFields,
  })
  .superRefine(checkRoleScope);

// changePasswordSchema et forgotPasswordSchema : inchangés (conserver les définitions existantes).
```

- [ ] **Step 4: Implémenter la vérification d'existence**

```ts
// lib/users/scope.ts
import { Client } from "@/models/Client";
import { Equipe } from "@/models/Equipe";

/** Retourne un message d'erreur si le client ou l'équipe référencés n'existent pas. */
export async function findScopeError(input: {
  clientId?: string;
  equipeId?: string;
}): Promise<string | null> {
  if (input.clientId && !(await Client.exists({ _id: input.clientId }))) {
    return "Client introuvable";
  }
  if (input.equipeId && !(await Equipe.exists({ _id: input.equipeId }))) {
    return "Équipe introuvable";
  }
  return null;
}
```

Dans `app/api/users/route.ts` (POST), après `await connectDB();` et avant la recherche de doublon :

```ts
const scopeError = await findScopeError({ clientId, equipeId });
if (scopeError) return NextResponse.json({ error: scopeError }, { status: 400 });
```

Dans `app/api/users/[id]/route.ts` (PUT), remplacer l'appel `findByIdAndUpdate` : vérifier l'existence puis utiliser `$set` / `$unset` (Mongoose ignore les clés `undefined` : sans `$unset`, l'ancien rattachement resterait en base) :

```ts
const scopeError = await findScopeError({ clientId, equipeId });
if (scopeError) return NextResponse.json({ error: scopeError }, { status: 400 });

const set: Record<string, unknown> = { nom, email: email.toLowerCase(), role, telephone };
const unset: Record<string, 1> = {};
if (clientId) set.clientId = clientId; else unset.clientId = 1;
if (equipeId) set.equipeId = equipeId; else unset.equipeId = 1;

const updated = await User.findByIdAndUpdate(
  id,
  Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set },
  { new: true }
)
  .select("-motDePasseHash")
  .populate("clientId", "nom")
  .populate("equipeId", "nom")
  .lean();
```

Ajouter `import { findScopeError } from "@/lib/users/scope";` dans les deux routes. Dans `POST`, `clientId: clientId || undefined` peut rester tel quel (le validateur garantit déjà `undefined` ou un identifiant valide).

- [ ] **Step 5: Adapter les tests existants** : dans `tests/integration/users-auth.test.ts`, les cas qui créent un `chauffeur` ou un `client` sans rattachement doivent créer d'abord une `Equipe` / un `Client` et passer son identifiant. Lister dans le rapport chaque test modifié et pourquoi.

- [ ] **Step 6: Relancer** — `npx vitest run tests/unit/user-validators.test.ts tests/integration/users-scope.test.ts tests/integration/users-auth.test.ts tests/integration/users-reset-password.test.ts` → PASS ; puis `npx tsc --noEmit && npm run lint`.

- [ ] **Step 7: Interface** : vérifier dans `components/users/UserFormModal.tsx` que le formulaire envoie `clientId` / `equipeId` vides pour les rôles qui n'en ont pas (les sélecteurs apparaissent déjà pour `client` et `chauffeur`, lignes ~235 et ~251) et qu'il **efface** la valeur du champ quand le rôle change (sinon le validateur refuse l'envoi). Si ce n'est pas le cas, ajouter dans le gestionnaire `onChange` du rôle : `setForm({ ...form, role: value, clientId: value === "client" ? form.clientId : "", equipeId: value === "chauffeur" ? form.equipeId : "" })`.

- [ ] **Step 8: Commit**

```bash
git add lib/validators/user.ts lib/users/scope.ts app/api/users tests/unit/user-validators.test.ts tests/integration/users-scope.test.ts tests/integration/users-auth.test.ts components/users/UserFormModal.tsx
git commit -m "fix(users): rattachement client/équipe cohérent avec le rôle et vérifié en base"
```

---

### Task 5: Chauffeur refusé par défaut et référentiels réservés au personnel

**Files:**
- Modify: `lib/api-auth.ts`, `app/api/operations/route.ts`, `app/api/operations/[id]/route.ts`, `app/api/operations/[id]/rapport/route.ts`, `app/api/operations/[id]/statut/route.ts`, `app/api/operations/[id]/photos/route.ts`
- Test: `tests/integration/chauffeur-scope.test.ts` ; adapter `tests/integration/authz-roles.test.ts` si nécessaire

**Interfaces:**
- Modifie : `isWithinTeamScope(auth, operationEquipeId)` devient **fermé par défaut** — un chauffeur sans `equipeId` en session obtient `false` (avant : `true`).
- Modifie : `requireInternalAuth(requireWrite?)` refuse désormais `client` **et** `chauffeur` (403). Les routes qui l'utilisent (récurrences, équipes, véhicules, équipements, import, statistiques) ne sont donc plus accessibles à un chauffeur.
- Message unique pour un refus d'équipe : `"Opération non affectée à votre équipe"` (403).

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// tests/integration/chauffeur-scope.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { GET as listOperations } from "@/app/api/operations/route";
import { GET as getOperation } from "@/app/api/operations/[id]/route";
import { GET as getRapport } from "@/app/api/operations/[id]/rapport/route";
import { PATCH as updateStatus } from "@/app/api/operations/[id]/statut/route";
import { GET as getEquipes } from "@/app/api/equipes/route";
import { GET as getVehicules } from "@/app/api/vehicules/route";
import { GET as getRecurrences } from "@/app/api/recurrences/route";
import { GET as getStats } from "@/app/api/dashboard/stats/route";
import { Client } from "@/models/Client";
import { Site } from "@/models/Site";
import { Equipe } from "@/models/Equipe";
import { Operation } from "@/models/Operation";

function mockSession(user: Record<string, unknown>) {
  vi.mocked(nextAuth.getServerSession).mockResolvedValue({
    user: { id: "507f1f77bcf86cd799439011", name: "T", email: "t@srh.ci", username: "t", ...user },
  } as never);
}

async function seed() {
  const client = await Client.create({ nom: "Client A" });
  const site = await Site.create({ clientId: client._id, nom: "Site A" });
  const equipeA = await Equipe.create({ nom: "A" });
  const equipeB = await Equipe.create({ nom: "B" });
  const mk = (equipeId?: unknown) =>
    Operation.create({
      clientId: client._id, siteId: site._id, natureIntervention: "Collecte",
      dateHeurePrevue: new Date(2026, 5, 15), statut: "En cours", ...(equipeId ? { equipeId } : {}),
    });
  return { equipeA, equipeB, opA: await mk(equipeA._id), opB: await mk(equipeB._id), opFree: await mk() };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`http://localhost:3000${url}`, init);

describe("chauffeur : périmètre d'équipe (fermé par défaut)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("un chauffeur sans équipe en session est refusé partout où il agirait sur des opérations", async () => {
    const { opA } = await seed();
    mockSession({ role: "chauffeur" });

    expect((await listOperations(req("/api/operations"))).status).toBe(403);
    expect((await getOperation(req(`/api/operations/${opA._id}`), params(String(opA._id)))).status).toBe(403);
    const patch = await updateStatus(
      req(`/api/operations/${opA._id}/statut`, { method: "PATCH", body: JSON.stringify({ statut: "Terminée", quantiteCollectee: 5 }) }),
      params(String(opA._id))
    );
    expect(patch.status).toBe(403);
    expect((await Operation.findById(opA._id))?.statut).toBe("En cours");
  });

  it("un chauffeur d'équipe A ne lit que les opérations de son équipe (liste, détail, rapport)", async () => {
    const { equipeA, opA, opB, opFree } = await seed();
    mockSession({ role: "chauffeur", equipeId: String(equipeA._id) });

    const list = await (await listOperations(req("/api/operations?equipeId=" + opB.equipeId))).json();
    expect(list.items.map((o: { _id: string }) => String(o._id))).toEqual([String(opA._id)]);

    expect((await getOperation(req(`/api/operations/${opA._id}`), params(String(opA._id)))).status).toBe(200);
    expect((await getOperation(req(`/api/operations/${opB._id}`), params(String(opB._id)))).status).toBe(404);
    expect((await getOperation(req(`/api/operations/${opFree._id}`), params(String(opFree._id)))).status).toBe(404);
    expect((await getRapport(req(`/api/operations/${opB._id}/rapport`), params(String(opB._id)))).status).toBe(404);
  });

  it("le refus d'équipe utilise le message exact", async () => {
    const { equipeA, opB } = await seed();
    mockSession({ role: "chauffeur", equipeId: String(equipeA._id) });
    const res = await updateStatus(
      req(`/api/operations/${opB._id}/statut`, { method: "PATCH", body: JSON.stringify({ statut: "Terminée", quantiteCollectee: 5 }) }),
      params(String(opB._id))
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Opération non affectée à votre équipe");
  });

  it.each([
    ["équipes", getEquipes, "/api/equipes"],
    ["véhicules", getVehicules, "/api/vehicules"],
    ["récurrences", getRecurrences, "/api/recurrences"],
    ["statistiques", getStats, "/api/dashboard/stats"],
  ])("un chauffeur n'accède pas à %s", async (_n, handler, url) => {
    const { equipeA } = await seed();
    mockSession({ role: "chauffeur", equipeId: String(equipeA._id) });
    expect((await (handler as (r: NextRequest) => Promise<Response>)(req(url))).status).toBe(403);
  });
});
```

- [ ] **Step 2: Lancer** — `npx vitest run tests/integration/chauffeur-scope.test.ts` → FAIL (chauffeur sans équipe non restreint ; détail non filtré ; référentiels ouverts au chauffeur ; ancien message).

- [ ] **Step 3: Implémenter dans `lib/api-auth.ts`**

```ts
// requireInternalAuth : refuse aussi le chauffeur
export async function requireInternalAuth(requireWrite = false): Promise<AuthResult> {
  const auth = await requireAuth(requireWrite);
  if (auth.error) return auth;

  if (isClientUser(auth.role) || isChauffeur(auth.role)) {
    return fail("Accès refusé", 403);
  }

  return auth;
}

/** Message unique quand une opération n'appartient pas à l'équipe du chauffeur. */
export const TEAM_SCOPE_ERROR = "Opération non affectée à votre équipe";

/**
 * Vrai si le chauffeur connecté peut agir sur l'opération. Refus par défaut :
 * un chauffeur sans équipe en session n'agit sur rien, et une opération non
 * affectée n'est pas visible d'un chauffeur.
 */
export function isWithinTeamScope(auth: AuthSuccess, operationEquipeId: unknown): boolean {
  if (!isChauffeur(auth.role)) return true;
  if (!auth.equipeId) return false;
  const opTeam = extractId(operationEquipeId);
  return opTeam !== "" && opTeam === String(auth.equipeId);
}
```

Dans `statut/route.ts` et `photos/route.ts` (POST et DELETE), remplacer chaque `{ error: "Opération affectée à une autre équipe" }` par `{ error: TEAM_SCOPE_ERROR }` (import depuis `@/lib/api-auth`).

- [ ] **Step 4: Détail et rapport.** Dans `app/api/operations/[id]/route.ts` (GET) et `app/api/operations/[id]/rapport/route.ts` (GET), juste après le contrôle `isWithinClientScope`, ajouter :

```ts
if (!isWithinTeamScope(auth, (operation as { equipeId?: unknown }).equipeId)) {
  return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
}
```

(importer `isWithinTeamScope`). Dans `app/api/operations/route.ts` (GET), remplacer le bloc chauffeur par un refus explicite sans équipe :

```ts
if (isChauffeur(auth.role)) {
  if (!auth.equipeId) {
    return NextResponse.json({ error: "Compte chauffeur sans équipe attribuée" }, { status: 403 });
  }
  filter.equipeId = auth.equipeId;
}
```

- [ ] **Step 5: Vérifier le parcours chauffeur réel.** Rechercher (`grep -n "fetch(" components/terrain/TerrainViewClient.tsx components/operations/OperationDetailClient.tsx`) les routes appelées par la console terrain et le détail d'opération. Si `OperationDetailClient` charge, pour un chauffeur, `/api/equipes`, `/api/vehicules` ou `/api/equipements` (listes déroulantes d'édition), ne pas rouvrir ces routes : masquer ou sauter ces appels quand `role === "chauffeur"` (le chauffeur n'édite pas l'affectation). Consigner les fichiers touchés dans le rapport.

- [ ] **Step 6: Adapter `tests/integration/authz-roles.test.ts`** : le cas « chauffeur » existant (ligne ~164) doit continuer à passer avec un `equipeId` ; tout cas qui s'appuyait sur « chauffeur sans équipe non restreint » doit être réécrit vers le refus. Lister les tests modifiés dans le rapport.

- [ ] **Step 7: Relancer** — `npx vitest run tests/integration/chauffeur-scope.test.ts tests/integration/authz-roles.test.ts` puis la suite complète, `npx tsc --noEmit`, `npm run lint`. Expected: tout vert.

- [ ] **Step 8: Commit**

```bash
git add lib/api-auth.ts app/api/operations tests/integration
git commit -m "fix(acces): chauffeur limité à son équipe (fermé par défaut) et référentiels réservés au personnel"
```

---

### Task 6: Changement forcé du mot de passe et session à jour

**Files:**
- Create: `lib/auth-refresh.ts`
- Modify: `lib/auth.ts`, `lib/api-auth.ts`, `lib/page-auth.ts`, `app/api/auth/change-password/route.ts`, `app/(dashboard)/profil/page.tsx`
- Test: `tests/integration/auth-refresh.test.ts`, `tests/integration/must-change-password.test.ts`, extension de `tests/unit/page-auth.test.ts`

**Interfaces:**
- Produces:
  - `refreshTokenFromDb(token: JWT): Promise<JWT>` — recharge `role`, `clientId`, `equipeId`, `mustChangePassword` depuis `User` ; si le compte n'existe plus, renvoie le jeton avec `invalid: true`.
  - `requireAuth(requireWrite?: boolean, opts?: { allowMustChangePassword?: boolean })` — répond `403 { error: "Changement de mot de passe requis", code: "MUST_CHANGE_PASSWORD" }` quand `session.user.mustChangePassword` est vrai, sauf option contraire.
  - JWT : `invalid?: boolean`, `refreshedAt?: number` (ms) ajoutés au type `JWT` (`declare module "next-auth/jwt"`).

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// tests/integration/auth-refresh.test.ts
import { describe, it, expect } from "vitest";
import { refreshTokenFromDb } from "@/lib/auth-refresh";
import { User } from "@/models/User";
import { Client } from "@/models/Client";

const baseToken = (id: string) =>
  ({ id, username: "u", role: "dispatcher", mustChangePassword: true } as never);

describe("refreshTokenFromDb", () => {
  it("reflète un changement de rôle, de rattachement et la fin du changement forcé", async () => {
    const client = await Client.create({ nom: "C" });
    const user = await User.create({
      username: "u", nom: "U", email: "u@srh.ci", motDePasseHash: "x",
      role: "client", clientId: client._id, mustChangePassword: false,
    });

    const token = await refreshTokenFromDb(baseToken(String(user._id)));

    expect(token.role).toBe("client");
    expect(token.clientId).toBe(String(client._id));
    expect(token.mustChangePassword).toBe(false);
    expect(token.invalid).toBeFalsy();
    expect(typeof token.refreshedAt).toBe("number");
  });

  it("marque le jeton invalide si le compte a été supprimé", async () => {
    const token = await refreshTokenFromDb(baseToken("507f1f77bcf86cd799439099"));
    expect(token.invalid).toBe(true);
  });
});
```

```ts
// tests/integration/must-change-password.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";
import bcrypt from "bcryptjs";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { GET as listOperations } from "@/app/api/operations/route";
import { POST as changePassword } from "@/app/api/auth/change-password/route";
import { User } from "@/models/User";

function session(user: Record<string, unknown>) {
  vi.mocked(nextAuth.getServerSession).mockResolvedValue({
    user: { name: "T", email: "t@srh.ci", username: "t", ...user },
  } as never);
}

describe("changement de mot de passe obligatoire", () => {
  beforeEach(() => vi.resetAllMocks());

  it("bloque les API métier tant que le mot de passe temporaire n'est pas changé", async () => {
    session({ id: "507f1f77bcf86cd799439011", role: "admin", mustChangePassword: true });
    const res = await listOperations(new NextRequest("http://localhost:3000/api/operations"));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("MUST_CHANGE_PASSWORD");
  });

  it("laisse passer les comptes sans drapeau", async () => {
    session({ id: "507f1f77bcf86cd799439011", role: "admin", mustChangePassword: false });
    const res = await listOperations(new NextRequest("http://localhost:3000/api/operations"));
    expect(res.status).toBe(200);
  });

  it("autorise change-password malgré le drapeau et lève le drapeau en base", async () => {
    const user = await User.create({
      username: "tmp", nom: "Tmp", email: "tmp@srh.ci",
      motDePasseHash: await bcrypt.hash("Temp0raire!", 10),
      role: "dispatcher", mustChangePassword: true,
    });
    session({ id: String(user._id), role: "dispatcher", mustChangePassword: true });

    const res = await changePassword(
      new NextRequest("http://localhost:3000/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: "Temp0raire!", newPassword: "NouveauMdp1" }),
      })
    );

    expect(res.status).toBe(200);
    const after = await User.findById(user._id);
    expect(after?.mustChangePassword).toBe(false);
    expect(await bcrypt.compare("NouveauMdp1", after!.motDePasseHash)).toBe(true);
  });
});
```

Ajouter à `tests/unit/page-auth.test.ts` :

```ts
it("redirige vers /profil tant que le mot de passe temporaire n'est pas changé", async () => {
  vi.mocked(nextAuth.getServerSession).mockResolvedValue({
    user: { id: "507f1f77bcf86cd799439011", name: "T", email: "t@srh.ci", username: "t", role: "admin", mustChangePassword: true },
  } as never);
  await expect(requirePageAccess("/clients")).rejects.toThrow("REDIRECT:/profil?forcer=1");
});

it("laisse ouvrir /profil malgré le drapeau", async () => {
  vi.mocked(nextAuth.getServerSession).mockResolvedValue({
    user: { id: "507f1f77bcf86cd799439011", name: "T", email: "t@srh.ci", username: "t", role: "client", mustChangePassword: true },
  } as never);
  await expect(requirePageAccess("/profil")).resolves.toBeDefined();
});
```

- [ ] **Step 2: Lancer** — `npx vitest run tests/integration/auth-refresh.test.ts tests/integration/must-change-password.test.ts tests/unit/page-auth.test.ts` → FAIL.

- [ ] **Step 3: Implémenter `lib/auth-refresh.ts`**

```ts
// lib/auth-refresh.ts
import type { JWT } from "next-auth/jwt";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";

/** Intervalle maximal entre deux relectures du compte dans la base. */
export const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export function needsRefresh(token: JWT, now = Date.now()): boolean {
  return !token.refreshedAt || now - token.refreshedAt > REFRESH_INTERVAL_MS;
}

/**
 * Recharge depuis la base les attributs qui commandent les droits : un
 * changement de rôle, de rattachement ou de mot de passe temporaire est pris
 * en compte sans attendre une nouvelle connexion, et un compte supprimé rend
 * le jeton invalide.
 */
export async function refreshTokenFromDb(token: JWT): Promise<JWT> {
  await connectDB();
  const user = await User.findById(token.id)
    .select("role clientId equipeId mustChangePassword")
    .lean();

  if (!user) {
    return { ...token, invalid: true, refreshedAt: Date.now() };
  }

  return {
    ...token,
    invalid: false,
    role: user.role,
    clientId: user.clientId ? String(user.clientId) : undefined,
    equipeId: user.equipeId ? String(user.equipeId) : undefined,
    mustChangePassword: Boolean(user.mustChangePassword),
    refreshedAt: Date.now(),
  };
}
```

Dans `lib/auth.ts` : ajouter `invalid?: boolean; refreshedAt?: number;` au type `JWT`, importer `needsRefresh, refreshTokenFromDb`, et remplacer les callbacks :

```ts
async jwt({ token, user, trigger }) {
  if (user) {
    token.id = user.id;
    token.username = user.username;
    token.role = user.role;
    token.clientId = user.clientId;
    token.equipeId = user.equipeId;
    token.mustChangePassword = user.mustChangePassword;
    token.refreshedAt = Date.now();
    return token;
  }
  if (trigger === "update" || needsRefresh(token)) {
    return refreshTokenFromDb(token);
  }
  return token;
},
async session({ session, token }) {
  // Compte supprimé : session sans utilisateur, donc refusée partout (401 / redirection /login).
  if (token.invalid) return { ...session, user: undefined } as never;
  if (session.user) {
    session.user.id = token.id;
    session.user.username = token.username;
    session.user.role = token.role;
    session.user.clientId = token.clientId;
    session.user.equipeId = token.equipeId;
    session.user.mustChangePassword = token.mustChangePassword;
  }
  return session;
},
```

- [ ] **Step 4: Appliquer le drapeau côté API** (`lib/api-auth.ts`). Adapter `fail` pour accepter un code et `requireAuth` pour l'option :

```ts
function fail(message: string, status: number, code?: string): AuthFailure {
  return { error: NextResponse.json(code ? { error: message, code } : { error: message }, { status }) };
}

export async function requireAuth(
  requireWrite = false,
  opts: { allowMustChangePassword?: boolean } = {}
): Promise<AuthResult> {
  // … (début inchangé jusqu'au contrôle du clientId du compte client)

  if (session.user.mustChangePassword && !opts.allowMustChangePassword) {
    return fail("Changement de mot de passe requis", 403, "MUST_CHANGE_PASSWORD");
  }

  // … (suite inchangée)
}
```

Dans `app/api/auth/change-password/route.ts` : `const auth = await requireAuth(false, { allowMustChangePassword: true });`.

- [ ] **Step 5: Appliquer le drapeau côté pages** (`lib/page-auth.ts`), entre le contrôle de session et le contrôle de la matrice :

```ts
if (session.user.mustChangePassword && pathname !== "/profil") {
  redirect("/profil?forcer=1");
}
```

- [ ] **Step 6: Page profil.** Dans `app/(dashboard)/profil/page.tsx` : lire `?forcer=1` (`useSearchParams`) pour afficher, en tête, l'encart « Vous utilisez un mot de passe temporaire : choisissez un nouveau mot de passe pour continuer. » ; après un `res.ok`, appeler `await update()` (de `const { data: session, update } = useSession()`) pour que le jeton relise la base, puis `router.replace(homePathFor(session?.user?.role))` si le drapeau était actif. Conserver le reste (messages, champs).

- [ ] **Step 7: Relancer** — les trois fichiers de test, puis la suite complète, `npx tsc --noEmit`, `npm run lint`. Attention : les tests existants qui appellent des routes avec une session simulée où `mustChangePassword` est absent restent inchangés (le drapeau vaut `undefined`).

- [ ] **Step 8: Commit**

```bash
git add lib/auth-refresh.ts lib/auth.ts lib/api-auth.ts lib/page-auth.ts app/api/auth/change-password/route.ts "app/(dashboard)/profil/page.tsx" tests
git commit -m "feat(auth): changement forcé du mot de passe temporaire et jeton rafraîchi depuis la base"
```

---

### Task 7: Mineurs différés

**Files:**
- Modify: `components/operations/OperationDetailClient.tsx`, `app/api/recurrences/generate/route.ts`, `lib/api-auth.ts`, `lib/image-compress.ts`, `components/terrain/TerrainViewClient.tsx`
- Test: `tests/unit/client-scope.test.ts`, extension de `tests/integration/recurrences-api.test.ts`

- [ ] **Step 1: `isWithinClientScope` explicite.** Test :

```ts
// tests/unit/client-scope.test.ts
import { describe, it, expect } from "vitest";
import { isWithinClientScope } from "@/lib/api-auth";

const auth = (role: string, clientId?: string) => ({ role, clientId } as never);

describe("isWithinClientScope", () => {
  it("les rôles internes voient tout", () => {
    expect(isWithinClientScope(auth("admin"), "507f1f77bcf86cd799439011")).toBe(true);
  });
  it("un client ne voit que son client", () => {
    expect(isWithinClientScope(auth("client", "aaa"), "aaa")).toBe(true);
    expect(isWithinClientScope(auth("client", "aaa"), "bbb")).toBe(false);
  });
  it("un client sans clientId ne voit rien, même si le document n'a pas de client", () => {
    expect(isWithinClientScope(auth("client"), undefined)).toBe(false);
    expect(isWithinClientScope(auth("client", ""), "")).toBe(false);
  });
});
```

Implémentation : `if (!isClientUser(auth.role)) return true; if (!auth.clientId) return false; return extractId(documentClientId) === String(auth.clientId);`.

- [ ] **Step 2: Récurrences personnalisées dormantes.** Test (dans `tests/integration/recurrences-api.test.ts`, en réutilisant les helpers du fichier) : une récurrence `personnalisee` d'intervalle 1 jour, dont `derniereGeneration` date d'il y a 1500 jours, génère bien une occurrence à la prochaine échéance (avant : la garde de 1000 itérations la bloquait pour toujours). Correction dans `app/api/recurrences/generate/route.ts` (~ligne 39) : démarrer la recherche de l'échéance à `k = Math.max(1, Math.ceil((now.getTime() - anchor.getTime()) / (intervalleJours * 86400000)))` au lieu de `k = 1`, en gardant la borne de sécurité de 1000 itérations à partir de cette valeur. Lire d'abord le code de la boucle pour y insérer la valeur initiale sans changer la sémantique (l'occurrence générée reste alignée sur l'ancre + k × intervalle).

- [ ] **Step 3: Quantité vide.** Dans `components/operations/OperationDetailClient.tsx` (~ligne 115), n'envoyer `quantiteCollectee` que si le champ contient un nombre strictement positif (`undefined` sinon) et afficher l'erreur renvoyée par l'API (`alert` ou message existant) quand `res.ok` est faux, au lieu de ne rien faire. Pas de test automatique (aucune infrastructure de rendu React dans le dépôt) : vérification par lecture, `tsc` et lint ; le dire dans le rapport.

- [ ] **Step 4: Compression d'image.** Dans `lib/image-compress.ts` : remplir le canvas en blanc avant `drawImage` (les PNG transparents ne deviennent plus noirs) et rejeter avec `new Error("Format d'image non pris en charge (HEIC ?). Prenez la photo en JPEG.")` quand le décodage échoue. Dans `TerrainViewClient.tsx` (`handlePhotoSelect`), remplacer `.catch(() => null)` par la collecte des erreurs et un `alert` listant les photos refusées. Pas de test automatique (API canvas absente de l'environnement `node`) : lecture, `tsc`, lint.

- [ ] **Step 5: Vérifier et commettre**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`

```bash
git add components lib app tests
git commit -m "fix: mineurs différés (périmètre client explicite, récurrences dormantes, quantité vide, compression d'image)"
```

---

### Task 8: Documentation, vérification finale et revue

**Files:**
- Modify: `README.md`, `PLAN.md`, `scripts/generate-progress-report.ts`, `docs/superpowers/plans/2026-09-20-lot1-master.md`

- [ ] **Step 1: README.** Section « Rôles et accès » : reproduire la matrice de ce plan ; noter que les comptes `chauffeur` et `client` exigent un rattachement, que le mot de passe temporaire doit être changé à la première connexion, que le jeton de session est relu en base toutes les 5 minutes (un changement de rôle s'applique en moins de 5 minutes). Retirer la mise en garde « ne créez aucun compte client » **uniquement** si la revue de cette tâche est propre.

- [ ] **Step 2: PLAN.md et rapport d'avancement.** Ajouter une ligne de journal « Lot 1A — fuites d'accès fermées » ; dans `scripts/generate-progress-report.ts`, retirer de « reste à faire » les points fermés par 1A (le tableau de bord sans contrôle de rôle, le menu, les comptes incohérents, `mustChangePassword`). Ne pas régénérer ni commettre le PDF.

- [ ] **Step 3: Master.** Cocher dans `2026-09-20-lot1-master.md` les défauts A1 à A6 (ajouter « traité par 1A »).

- [ ] **Step 4: Vérification complète.**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: `tsc` propre, 0 erreur de lint, tous les tests verts (123 + ceux du lot).

- [ ] **Step 5: Contrôle manuel en développement** (base locale ou mémoire, jamais la base réelle) : créer un compte de chaque rôle, se connecter et vérifier la matrice — chauffeur redirigé vers `/terrain`, client vers `/acces-limite`, lecture sans `/import`, compte à mot de passe temporaire redirigé vers `/profil?forcer=1` puis libéré après changement. Consigner le résultat dans le rapport.

- [ ] **Step 6: Commit**

```bash
git add README.md PLAN.md scripts/generate-progress-report.ts docs/superpowers/plans/2026-09-20-lot1-master.md
git commit -m "docs: matrice d'accès, mot de passe temporaire et avancement Lot 1A"
```

- [ ] **Step 7: Revue de branche complète** (skill `superpowers:requesting-code-review`, modèle le plus capable) sur l'ensemble du lot, avec les critères : aucun accès possible hors matrice pour les 5 rôles (pages et API), aucun contournement par paramètre de requête, aucun secret journalisé, tests qui vérifient l'état en base.

---

## Auto-relecture

- **Couverture (défauts A1 à A6 du master) :** A1 → tâche 2 ; A2 → tâche 3 ; A3 → tâche 4 ; A4 → tâche 5 ; A5 → tâche 6 ; A6 → tâche 7. Aucun défaut sans tâche.
- **Placeholders :** les tâches 1 à 6 contiennent le code complet des tests et des fonctions nouvelles ; les tâches 7 et 8 modifient du code existant dont la forme exacte doit être lue sur place (numéros de lignes approximatifs) — elles décrivent le comportement attendu, les tests quand un test est possible, et le motif d'absence de test sinon.
- **Cohérence des noms :** `canAccessPath`, `homePathFor` (tâche 1) sont utilisés tels quels par `requirePageAccess` (tâche 2), `navForRole` (tâche 3) ; `TEAM_SCOPE_ERROR`, `isWithinTeamScope`, `requireInternalAuth` (tâche 5) ; `refreshTokenFromDb`, `needsRefresh`, `REFRESH_INTERVAL_MS`, `MUST_CHANGE_PASSWORD` (tâche 6) ; `findScopeError` (tâche 4).
- **Points de vigilance à l'exécution :** (1) la tâche 4 modifie des tests existants qui créent des comptes sans rattachement ; (2) la tâche 5 peut révéler des appels `/api/equipes` faits par le détail d'opération pour un chauffeur ; (3) la tâche 6 change le comportement du JWT pour tous les rôles : la suite complète doit rester verte.
