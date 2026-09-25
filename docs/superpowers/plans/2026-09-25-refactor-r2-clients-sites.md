# Refactoring R2 — Domaine `clients-sites` : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrer le domaine `clients-sites` (deux entités liées, `Client` et `Site`) vers l'architecture hexagonale (backend) et « screaming » (frontend), en reproduisant le modèle validé par `equipes`/`vehicules`/`equipements`. Aucun changement de comportement — y compris le périmètre de visibilité d'un compte `client` et l'absence de garde de suppression sur les sites.

**Architecture:** Un seul domaine backend `src/backend/clients-sites/` portant les deux entités : `domain/{client,site,erreurs,ports}.ts`, `application/cas-d-usage-clients.ts` + `cas-d-usage-sites.ts`, `infrastructure/{en-memoire,mongoose}/` (dépôts `Client` et `Site`, adaptateur `RattachementsUtilisateurs` propre au domaine), `http/` (schémas Zod, présentation, quatre contrôleurs), `composition.ts`, `index.ts`. Les routes `src/app/api/{clients,sites}/**/route.ts` deviennent des ré-exports. Frontend : le composant existant `ClientsPageClient` (déjà « screaming » dans l'esprit, gère clients et sites ensemble) déménage tel quel dans `src/frontend/clients-sites/composants/ClientsPageClient.tsx`.

**Tech Stack:** Next.js 16 (`src/`), TypeScript, Mongoose, Zod, Vitest + mongodb-memory-server, ESLint 9.

**Spec / feuille de route:** `docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md` (ligne 96 : `clients-sites` | périmètre d'un compte client | CRUD clients et sites | dépôts clients et sites ; `RattachementsUtilisateurs`) ; `docs/superpowers/plans/2026-09-20-refactor-architecture-master.md` (contraintes globales, recette, commande `verifier-build`, conventions, enseignements de R0/R1) ; modèles de référence **déjà présents dans le dépôt** : `src/backend/equipes/**` (port `RattachementsUtilisateurs`, garde de suppression), `src/backend/vehicules/**` (domaine à un seul dépôt, filet de caractérisation), `tests/integration/equipes-caracterisation.test.ts`, `tests/integration/vehicules-caracterisation.test.ts`.

## Global Constraints

- **Aucun changement de comportement** : mêmes codes HTTP, mêmes corps JSON (dont `_id`, `createdAt`, `updatedAt`, `__v`, et la forme peuplée `clientId: {_id, nom}` sur les listes/détails de sites), mêmes messages, même ordre des vérifications, même périmètre de visibilité (`isWithinClientScope`), même absence de garde de suppression sur `Site`. Écarts connus et acceptés de R0/R1 : la réponse 201 d'un POST liste `_id` en premier ; les lectures sont projetées par l'entité (champs hors schéma écrits hors Mongoose non renvoyés).
- Les tests existants ne changent que par leurs **chemins d'import**. Aucune assertion supprimée, affaiblie ou passée en `skip`.
- À chaque commit : `npx tsc --noEmit` propre, `npm run lint` (0 erreur), `npx vitest run` tout vert (687 tests au départ).
- Ne jamais lire ni afficher `.env.local` ; ne jamais lancer `npm run build`, `npm run seed`, `scripts/seed-admin.ts`, `scripts/send-test-mail.ts` ; aucun e-mail réel. Compilation Next : uniquement la commande `verifier-build` du plan maître (variables factices).
- Ne jamais stager `.agents/`, `.claude/`, `skills-lock.json`, `rapports/`. Commande d'ajout : `git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports'`.
- Après chaque passage du codemod `scripts/dev/remplacer-imports.mjs` : `git diff --stat`, et `git checkout -- <fichier>` pour tout fichier modifié à tort — **jamais** `git reset`.
- Langue : dossiers de domaine et vocabulaire métier en français, suffixes techniques en anglais.
- Branche : `refactor/r2-clients-sites` créée depuis `main` (`5aab446`).

### Faits vérifiés sur le code actuel (base du plan)

| | `Client` | `Site` |
|---|---|---|
| Champs du schéma | `nom` (String, requis), `contact: {telephone: String défaut "", email: String défaut ""}`, timestamps | `clientId` (ObjectId, ref `Client`, requis), `nom` (String, requis), `adresse` (String, défaut `""`), `localisation?: {lat: Number, lng: Number}` (pas de défaut), `typeDechets: [String]`, `observations` (String, défaut `""`), timestamps |
| Tri de la liste | `{ nom: 1 }` | `{ nom: 1 }` |
| Index | aucun | `{ clientId: 1 }` (non unique) |
| Validation Zod | `nom` min 1 « Le nom est requis » ; `contact.telephone` défaut `""` ; `contact.email` : `z.string().email()` ou `""` (optionnel) | `clientId` min 1 « Client requis » ; `nom` min 1 « Le nom est requis » ; `adresse` défaut `""` ; `localisation` objet `{lat:number, lng:number}` optionnel (pas de défaut) ; `typeDechets` tableau de chaînes, défaut `[]` ; `observations` défaut `""` |
| GET liste | `requireReferentialRead()` ; filtre `{_id: auth.clientId}` si `isClientUser(auth.role)`, sinon `{}` ; pas de `populate` | `requireReferentialRead()` ; `clientId = isClientUser(role) ? auth.clientId : searchParams.get("clientId")` ; filtre `{clientId}` si présent sinon `{}` ; **`.populate("clientId", "nom")`** — `clientId` devient `{_id, nom}` dans la réponse |
| GET par id | `requireReferentialRead()` ; 404 si absent **ou** si `!isWithinClientScope(auth, client._id)` (même message `"Non trouvé"`, la mise hors périmètre ne se distingue pas d'un 404 réel) ; pas de `populate` | idem, avec `.populate("clientId", "nom")` et `isWithinClientScope(auth, site.clientId)` (le champ peuplé ou non selon l'implémentation — `.populate` s'applique avant le contrôle) |
| POST | `requireAuth(true)` ; pas de contrôle d'existence de rattachement ; corps créé **sans populate** (`clientId` reste une chaîne d'ObjectId brute dans la réponse) | idem ; **aucune vérification que `clientId` référence un client existant** (à conserver tel quel) |
| PUT | `requireAuth(true)` ; `findByIdAndUpdate(..., {new:true}).lean()` sans populate ; 404 si absent | idem, sans populate |
| DELETE | `requireAuth(true)` ; **garde** : 409 `{"error":"Ce client est rattaché à des comptes utilisateurs"}` si `User.exists({clientId: id})`, sinon `findByIdAndDelete` → 404 ou `{success:true}` ; **aucun contrôle des sites du client** (un client avec des sites se supprime sans erreur, les sites restent en base avec un `clientId` orphelin — comportement actuel à préserver tel quel) | `requireAuth(true)` ; **aucune garde** : `findByIdAndDelete` direct → 404 ou `{success:true}` |
| Garde d'accès (rôles) | `requireReferentialRead` (lecture : personnel + `client` dans son périmètre, jamais `chauffeur`) / `requireAuth(true)` (écriture : refuse `client` et `chauffeur` via `canWrite`) — **différent** de `requireInternalAuth` utilisé par `equipes`/`vehicules`/`equipements` | idem |
| Importeurs des modèles hors domaine | `src/app/api/operations/[id]/{route.ts,rapport/route.ts}`, `src/app/api/dashboard/stats/route.ts`, `src/app/(dashboard)/page.tsx`, `src/app/api/import/route.ts`, `src/lib/users/scope.ts`, `src/backend/platform/base-de-donnees/enregistrement-modeles.ts`, `scripts/seed-admin.ts` (import relatif, **jamais exécuté**) | mêmes fichiers sauf `src/lib/users/scope.ts` |
| Importeurs des validateurs | aucun hors `src/app/api/clients/**` | aucun hors `src/app/api/sites/**` |
| Frontend actuel | `src/components/clients/ClientsPageClient.tsx` (composant unique gérant clients **et** sites : deux appels `fetch` (`/api/clients`, `/api/sites`), deux modales `EntityModal`, tableau avec sites imbriqués) ; page `src/app/(dashboard)/clients/page.tsx` compose `ClientsPageClient` ; **pas de page `/sites` dédiée** | — |

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `src/backend/clients-sites/**` (créer) | Domaine hexagonal (deux entités liées) |
| `src/frontend/clients-sites/**` (créer) | Fonctionnalité frontend (composant existant déplacé) |
| `tests/integration/clients-sites-caracterisation.test.ts` (créer) | Filet de comportement, écrit sur l'ancien code |
| `tests/architecture/regles-de-dependance.test.ts` (modifier) | Domaine et fonctionnalité déclarés migrés |

---

### Task 1: Domaine `clients-sites` — entité `Client`

**Files:**
- Create: `src/backend/clients-sites/domain/{client,erreurs,ports}.ts`, `application/cas-d-usage-clients.ts` (+ `.test.ts`), `infrastructure/en-memoire/client.repository.en-memoire.ts`, `infrastructure/mongoose/{client.model,client.repository.mongoose,rattachements-utilisateurs.mongoose}.ts` (+ `client.repository.mongoose.test.ts`), `http/{client.schema,presentation,clients.liste.controleur,clients.detail.controleur}.ts`, `composition.ts`, `index.ts`
- Create (filet, clients uniquement) : `tests/integration/clients-sites-caracterisation.test.ts` (routes clients ; les routes sites sont ajoutées à la tâche 2)
- Move: `src/models/Client.ts` → `src/backend/clients-sites/infrastructure/mongoose/client.model.ts` ; `src/lib/validators/client.ts` → `src/backend/clients-sites/http/client.schema.ts`
- Modify: `src/app/api/clients/route.ts`, `src/app/api/clients/[id]/route.ts`, `src/backend/platform/base-de-donnees/enregistrement-modeles.ts` (ligne `Client`, ordre conservé), importeurs (codemod)

**Interfaces:**
- Produit : `Client`, `ClientSaisie` ; `ClientRepository` ; `RattachementsUtilisateurs` (`existePourClient(clientId): Promise<boolean>`) ; `creerCasDUsageClients({ clients, rattachements })` → `{ lister, obtenir, creer, modifier, supprimer }` ; erreurs `ClientIntrouvable` (message `"Non trouvé"`), `ClientRattache` (message `"Ce client est rattaché à des comptes utilisateurs"`) ; `composition.ts` exporte `casDUsageClients`.
- Consomme : `connectDB` (`@/backend/platform/base-de-donnees/connexion`), `guardObjectId` (`@/backend/platform/http/identifiants`), `requireReferentialRead`, `requireAuth`, `isWithinClientScope`, `extractId` (`@/lib/api-auth`, transitoire — migre avec `comptes` R3), `isClientUser` (`@/shared/acces/permissions`).

- [ ] **Step 0: Branche et base de départ.** `git switch -c refactor/r2-clients-sites` (depuis `main`), puis `npx vitest run 2>&1 | grep -E "Test Files|Tests "` → 687 tests verts, `npx tsc --noEmit` propre, `npm run lint` 0 erreur.

- [ ] **Step 1: Caractérisation (filet), sur le code ACTUEL — routes clients.** Lire `tests/integration/vehicules-caracterisation.test.ts` (structure, helpers de session) et `tests/integration/authz-roles.test.ts` + `tests/integration/chauffeur-scope.test.ts` (déjà en place, ne pas dupliquer leur couverture : n'y ajouter que ce qui manque). Créer `tests/integration/clients-sites-caracterisation.test.ts`, section clients, couvrant au minimum pour `@/app/api/clients/route` et `@/app/api/clients/[id]/route` :
  - Liste triée par `nom`, avec **valeurs** (pas seulement les clés).
  - POST 201 avec l'**ensemble exact de clés** `_id, nom, contact, createdAt, updatedAt, __v` (`contact` avec `telephone` et `email` par défaut `""`) ; POST 400 (`nom` vide, `contact.email` invalide, corps de types faux) avec corps `error.flatten()`.
  - GET par id 200 (mêmes clés) / 404 `{"error":"Non trouvé"}` / 400 identifiant invalide.
  - PUT 200 (défauts appliqués) / 404 / 400 corps / 400 identifiant.
  - DELETE : 409 `{"error":"Ce client est rattaché à des comptes utilisateurs"}` si un `User` référence `clientId` (le client reste en base) — capturer un cas déjà couvert par `tests/integration/referentiels-delete-guard.test.ts`, ne pas le dupliquer, seulement s'assurer qu'il continue de passer après migration ; DELETE 200 `{success:true}` d'un client libre ; DELETE **d'un client qui a des sites mais aucun compte rattaché → 200, le client disparaît, les sites référençant son id restent en base** (comportement actuel, pas une régression à corriger) ; DELETE 404 ; DELETE 400 identifiant invalide.
  - 401 sans session ; 403 pour `chauffeur` (aucun accès, y compris en lecture) ; 403 `MUST_CHANGE_PASSWORD` sur écriture.
  - Corps JSON malformé en POST et PUT (`rejects.toThrow()`).

  Lancer : `npx vitest run tests/integration/clients-sites-caracterisation.test.ts` → **PASS**. Commit isolé :

```bash
git add tests/integration/clients-sites-caracterisation.test.ts
git commit -m "test(clients-sites): tests de caractérisation clients avant migration"
```

- [ ] **Step 2: Domaine, ports, faux en mémoire.**

```ts
// src/backend/clients-sites/domain/client.ts
export interface Client {
  id: string;
  nom: string;
  contact: { telephone: string; email: string };
  createdAt: Date;
  updatedAt: Date;
  /** Numéro de révision technique conservé pour reproduire la réponse JSON à l'identique (`__v`). */
  revision?: number;
}

export interface ClientSaisie {
  nom: string;
  contact: { telephone: string; email: string };
}
```

```ts
// src/backend/clients-sites/domain/erreurs.ts
export class ClientIntrouvable extends Error {
  constructor() {
    super("Non trouvé");
    this.name = "ClientIntrouvable";
  }
}

export class ClientRattache extends Error {
  constructor() {
    super("Ce client est rattaché à des comptes utilisateurs");
    this.name = "ClientRattache";
  }
}
```

```ts
// src/backend/clients-sites/domain/ports.ts
import type { Client, ClientSaisie } from "./client";

export interface ClientRepository {
  /** Tous les clients, ou seulement `idClient` si fourni (périmètre d'un compte `client`), triés par nom croissant. */
  lister(idClient?: string): Promise<Client[]>;
  trouverParId(id: string): Promise<Client | null>;
  creer(saisie: ClientSaisie): Promise<Client>;
  /** null si le client n'existe pas. */
  modifier(id: string, saisie: ClientSaisie): Promise<Client | null>;
  /** false si le client n'existait pas. */
  supprimer(id: string): Promise<boolean>;
}

export interface RattachementsUtilisateurs {
  existePourClient(clientId: string): Promise<boolean>;
}
```

(Le port `SiteRepository` est ajouté au même fichier à la tâche 2 — ne pas créer `site.ts` ni le compléter ici.)

```ts
// src/backend/clients-sites/infrastructure/en-memoire/client.repository.en-memoire.ts
import type { Client, ClientSaisie } from "../../domain/client";
import type { ClientRepository } from "../../domain/ports";

/** Dépôt en mémoire pour les tests des cas d'usage. Fidèle au dépôt Mongoose sur le tri
 * (comparaison binaire) et la révision initiale ; ne reproduit pas de contrainte d'unicité
 * (il n'y en a aucune sur `Client`). */
export class ClientRepositoryEnMemoire implements ClientRepository {
  private readonly donnees = new Map<string, Client>();
  private compteur = 0;

  async lister(idClient?: string): Promise<Client[]> {
    const valeurs = [...this.donnees.values()].filter((c) => !idClient || c.id === idClient);
    return valeurs.sort((a, b) => (a.nom < b.nom ? -1 : a.nom > b.nom ? 1 : 0));
  }

  async trouverParId(id: string): Promise<Client | null> {
    return this.donnees.get(id) ?? null;
  }

  async creer(saisie: ClientSaisie): Promise<Client> {
    this.compteur += 1;
    const maintenant = new Date();
    const client: Client = { id: `client-${this.compteur}`, ...saisie, createdAt: maintenant, updatedAt: maintenant, revision: 0 };
    this.donnees.set(client.id, client);
    return client;
  }

  async modifier(id: string, saisie: ClientSaisie): Promise<Client | null> {
    const existant = this.donnees.get(id);
    if (!existant) return null;
    const modifie: Client = { ...existant, ...saisie, updatedAt: new Date() };
    this.donnees.set(id, modifie);
    return modifie;
  }

  async supprimer(id: string): Promise<boolean> {
    return this.donnees.delete(id);
  }
}
```

- [ ] **Step 3: Test des cas d'usage (rouge), puis cas d'usage (vert).**

```ts
// src/backend/clients-sites/application/cas-d-usage-clients.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { creerCasDUsageClients } from "./cas-d-usage-clients";
import { ClientIntrouvable, ClientRattache } from "../domain/erreurs";
import { ClientRepositoryEnMemoire } from "../infrastructure/en-memoire/client.repository.en-memoire";
import type { RattachementsUtilisateurs } from "../domain/ports";

const rattachementsAucun: RattachementsUtilisateurs = { existePourClient: async () => false };
const rattachementsPresent: RattachementsUtilisateurs = { existePourClient: async () => true };
const saisie = (nom: string) => ({ nom, contact: { telephone: "", email: "" } });

let clients: ClientRepositoryEnMemoire;

beforeEach(() => {
  clients = new ClientRepositoryEnMemoire();
});

describe("cas d'usage des clients", () => {
  it("liste les clients triés par nom (ordre binaire), filtrés par idClient si fourni", async () => {
    const cas = creerCasDUsageClients({ clients, rattachements: rattachementsAucun });
    await cas.creer(saisie("Beta"));
    const alpha = await cas.creer(saisie("Alpha"));
    expect((await cas.lister()).map((c) => c.nom)).toEqual(["Alpha", "Beta"]);
    expect((await cas.lister(alpha.id)).map((c) => c.nom)).toEqual(["Alpha"]);
  });

  it("crée puis obtient un client avec sa révision initiale", async () => {
    const cas = creerCasDUsageClients({ clients, rattachements: rattachementsAucun });
    const cree = await cas.creer(saisie("Alpha"));
    expect(cree.revision).toBe(0);
    expect(await cas.obtenir(cree.id)).toMatchObject({ nom: "Alpha" });
  });

  it("obtenir un client inconnu lève ClientIntrouvable", async () => {
    const cas = creerCasDUsageClients({ clients, rattachements: rattachementsAucun });
    await expect(cas.obtenir("inconnu")).rejects.toBeInstanceOf(ClientIntrouvable);
  });

  it("modifie un client existant et refuse un client inconnu", async () => {
    const cas = creerCasDUsageClients({ clients, rattachements: rattachementsAucun });
    const cree = await cas.creer(saisie("Alpha"));
    expect((await cas.modifier(cree.id, saisie("Alpha modifié"))).nom).toBe("Alpha modifié");
    await expect(cas.modifier("inconnu", saisie("X"))).rejects.toBeInstanceOf(ClientIntrouvable);
  });

  it("refuse de supprimer un client rattaché à des comptes (ClientRattache), sans le retirer", async () => {
    const cas = creerCasDUsageClients({ clients, rattachements: rattachementsPresent });
    const cree = await cas.creer(saisie("Alpha"));
    await expect(cas.supprimer(cree.id)).rejects.toBeInstanceOf(ClientRattache);
    expect(await cas.obtenir(cree.id)).toMatchObject({ nom: "Alpha" });
  });

  it("supprime un client sans compte rattaché et refuse un client inconnu", async () => {
    const cas = creerCasDUsageClients({ clients, rattachements: rattachementsAucun });
    const cree = await cas.creer(saisie("Alpha"));
    await cas.supprimer(cree.id);
    await expect(cas.obtenir(cree.id)).rejects.toBeInstanceOf(ClientIntrouvable);
    await expect(cas.supprimer(cree.id)).rejects.toBeInstanceOf(ClientIntrouvable);
  });
});
```

Run : `npx vitest run src/backend/clients-sites/application` → FAIL (module absent). Puis :

```ts
// src/backend/clients-sites/application/cas-d-usage-clients.ts
import type { Client, ClientSaisie } from "../domain/client";
import { ClientIntrouvable, ClientRattache } from "../domain/erreurs";
import type { ClientRepository, RattachementsUtilisateurs } from "../domain/ports";

export interface DependancesClients {
  clients: ClientRepository;
  rattachements: RattachementsUtilisateurs;
}

export function creerCasDUsageClients({ clients, rattachements }: DependancesClients) {
  return {
    lister(idClient?: string): Promise<Client[]> {
      return clients.lister(idClient);
    },

    async obtenir(id: string): Promise<Client> {
      const client = await clients.trouverParId(id);
      if (!client) throw new ClientIntrouvable();
      return client;
    },

    creer(saisie: ClientSaisie): Promise<Client> {
      return clients.creer(saisie);
    },

    async modifier(id: string, saisie: ClientSaisie): Promise<Client> {
      const client = await clients.modifier(id, saisie);
      if (!client) throw new ClientIntrouvable();
      return client;
    },

    async supprimer(id: string): Promise<void> {
      if (await rattachements.existePourClient(id)) throw new ClientRattache();
      if (!(await clients.supprimer(id))) throw new ClientIntrouvable();
    },
  };
}

export type CasDUsageClients = ReturnType<typeof creerCasDUsageClients>;
```

Run : `npx vitest run src/backend/clients-sites/application` → PASS.

- [ ] **Step 4: Modèle déplacé (codemods), adaptateur Mongoose + rattachements + test de contrat.**

```bash
mkdir -p src/backend/clients-sites/infrastructure/mongoose src/backend/clients-sites/http
git mv src/models/Client.ts src/backend/clients-sites/infrastructure/mongoose/client.model.ts
git mv src/lib/validators/client.ts src/backend/clients-sites/http/client.schema.ts
node scripts/dev/remplacer-imports.mjs "@/models/Client" "@/backend/clients-sites/infrastructure/mongoose/client.model"
node scripts/dev/remplacer-imports.mjs "@/lib/validators/client" "@/backend/clients-sites/http/client.schema"
git diff --stat
```

Relire `git diff --stat` : annuler avec `git checkout -- <fichier>` tout fichier modifié à tort (fixtures de test, commentaires). Mettre à jour à la main `scripts/seed-admin.ts` (import relatif, **fichier jamais exécuté**) et, dans `enregistrement-modeles.ts`, remplacer `import "@/models/Client";` par `import "@/backend/clients-sites/infrastructure/mongoose/client.model";` **à la même place** (1ʳᵉ ligne). Le schéma du modèle ne change pas.

```ts
// src/backend/clients-sites/infrastructure/mongoose/client.repository.mongoose.ts
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type { Client, ClientSaisie } from "../../domain/client";
import type { ClientRepository } from "../../domain/ports";
import { Client as ClientModel } from "./client.model";

interface DocumentClient {
  _id: unknown;
  nom: string;
  contact: { telephone: string; email: string };
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

function versEntite(doc: DocumentClient): Client {
  return {
    id: String(doc._id),
    nom: doc.nom,
    contact: { telephone: doc.contact?.telephone ?? "", email: doc.contact?.email ?? "" },
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    revision: doc.__v,
  };
}

export class ClientRepositoryMongoose implements ClientRepository {
  async lister(idClient?: string): Promise<Client[]> {
    await connectDB();
    const filtre = idClient ? { _id: idClient } : {};
    const docs = (await ClientModel.find(filtre).sort({ nom: 1 }).lean()) as DocumentClient[];
    return docs.map(versEntite);
  }

  async trouverParId(id: string): Promise<Client | null> {
    await connectDB();
    const doc = (await ClientModel.findById(id).lean()) as DocumentClient | null;
    return doc ? versEntite(doc) : null;
  }

  async creer(saisie: ClientSaisie): Promise<Client> {
    await connectDB();
    const doc = await ClientModel.create(saisie);
    return versEntite(doc.toObject() as DocumentClient);
  }

  async modifier(id: string, saisie: ClientSaisie): Promise<Client | null> {
    await connectDB();
    const doc = (await ClientModel.findByIdAndUpdate(id, saisie, { new: true }).lean()) as DocumentClient | null;
    return doc ? versEntite(doc) : null;
  }

  async supprimer(id: string): Promise<boolean> {
    await connectDB();
    return Boolean(await ClientModel.findByIdAndDelete(id));
  }
}
```

```ts
// src/backend/clients-sites/infrastructure/mongoose/rattachements-utilisateurs.mongoose.ts
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type { RattachementsUtilisateurs } from "../../domain/ports";
// Transitoire : le modèle User rejoindra le domaine `comptes` au jalon R3 (l'import
// passera alors par `@/backend/comptes/index`).
import { User } from "@/models/User";

export class RattachementsUtilisateursMongoose implements RattachementsUtilisateurs {
  async existePourClient(clientId: string): Promise<boolean> {
    await connectDB();
    return Boolean(await User.exists({ clientId }));
  }
}
```

Test de contrat, sur le modèle de `src/backend/vehicules/infrastructure/mongoose/vehicule.repository.mongoose.test.ts` (mêmes cas, sans doublon puisque `Client` n'a pas d'index unique) — créer `src/backend/clients-sites/infrastructure/mongoose/client.repository.mongoose.test.ts` couvrant : création + relecture (id, révision 0, dates, `contact`), listage trié par nom, listage filtré par `idClient`, modification (+ `null` sur id inconnu), suppression (+ `false` sur id inconnu).

Run : `npx vitest run src/backend/clients-sites/infrastructure` → PASS.

- [ ] **Step 5: Contrôleurs, composition, index, routes.**

Dans `src/backend/clients-sites/http/client.schema.ts` (fichier déplacé, contenu inchangé) : ajouter **en haut** `import type { ClientSaisie } from "../domain/client";` et, à la suite :

```ts
export function versSaisieClient(entree: ClientInput): ClientSaisie {
  return { nom: entree.nom, contact: entree.contact };
}
```

```ts
// src/backend/clients-sites/http/presentation.ts
import type { Client } from "../domain/client";

/** Forme JSON historique de l'API (document Mongoose sérialisé). */
export function versReponseClient(client: Client) {
  return {
    _id: client.id,
    nom: client.nom,
    contact: client.contact,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
    __v: client.revision,
  };
}
```

(La fonction `versReponseSite` est ajoutée au même fichier à la tâche 2.)

```ts
// src/backend/clients-sites/composition.ts
import { creerCasDUsageClients } from "./application/cas-d-usage-clients";
import { ClientRepositoryMongoose } from "./infrastructure/mongoose/client.repository.mongoose";
import { RattachementsUtilisateursMongoose } from "./infrastructure/mongoose/rattachements-utilisateurs.mongoose";

const rattachements = new RattachementsUtilisateursMongoose();

export const casDUsageClients = creerCasDUsageClients({ clients: new ClientRepositoryMongoose(), rattachements });
```

(`casDUsageSites` est ajouté au même fichier à la tâche 2, en réutilisant `rattachements` si besoin ou en instanciant son propre dépôt.)

```ts
// src/backend/clients-sites/index.ts
// API publique du domaine `clients-sites` pour les autres domaines : aucune pour l'instant.
export {};
```

```ts
// src/backend/clients-sites/http/clients.liste.controleur.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireReferentialRead } from "@/lib/api-auth"; // transitoire : migre avec comptes (R3)
import { isClientUser } from "@/shared/acces/permissions";
import { casDUsageClients } from "../composition";
import { clientSchema, versSaisieClient } from "./client.schema";
import { versReponseClient } from "./presentation";

export async function GET() {
  const auth = await requireReferentialRead();
  if (auth.error) return auth.error;

  const idClient = isClientUser(auth.role) ? auth.clientId : undefined;
  const clients = await casDUsageClients.lister(idClient);
  return NextResponse.json(clients.map(versReponseClient));
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const body = await req.json();
  const parsed = clientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const client = await casDUsageClients.creer(versSaisieClient(parsed.data));
  return NextResponse.json(versReponseClient(client), { status: 201 });
}
```

```ts
// src/backend/clients-sites/http/clients.detail.controleur.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireReferentialRead, isWithinClientScope } from "@/lib/api-auth"; // transitoire : migre avec comptes (R3)
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { ClientIntrouvable, ClientRattache } from "../domain/erreurs";
import { casDUsageClients } from "../composition";
import { clientSchema, versSaisieClient } from "./client.schema";
import { versReponseClient } from "./presentation";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireReferentialRead();
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  let client;
  try {
    client = await casDUsageClients.obtenir(id);
  } catch (error) {
    if (error instanceof ClientIntrouvable) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
  if (!isWithinClientScope(auth, client.id)) {
    return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  }
  return NextResponse.json(versReponseClient(client));
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  const body = await req.json();
  const parsed = clientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    return NextResponse.json(versReponseClient(await casDUsageClients.modifier(id, versSaisieClient(parsed.data))));
  } catch (error) {
    if (error instanceof ClientIntrouvable) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  try {
    await casDUsageClients.supprimer(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ClientRattache) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof ClientIntrouvable) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
```

```ts
// src/app/api/clients/route.ts
export { GET, POST } from "@/backend/clients-sites/http/clients.liste.controleur";
```

```ts
// src/app/api/clients/[id]/route.ts
export { GET, PUT, DELETE } from "@/backend/clients-sites/http/clients.detail.controleur";
```

**Point de vigilance :** la route actuelle de détail (`clients/[id]/route.ts`) vérifie `isWithinClientScope` **après** avoir vérifié `!client` (404 direct), donc l'ordre `ClientIntrouvable` puis hors-périmètre ci-dessus reproduit exactement le comportement (les deux mènent au même 404 `"Non trouvé"`, indiscernables côté client).

- [ ] **Step 6: Vérifier** — `npx tsc --noEmit && npm run lint 2>&1 | tail -1 && npx vitest run 2>&1 | grep -E "Test Files|Tests "`. Les routes `sites` ne sont **pas encore** migrées (tâche 2) : ne pas déclarer `clients-sites` dans `domainesBackendMigres` à cette tâche (le vérificateur R2/R3 exigerait que le domaine entier — y compris `site.ts` — soit pur ; on le déclare seulement une fois la tâche 2 terminée).

- [ ] **Step 7: Commit**

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports'
git status --short | head -30
git commit -m "refactor(clients-sites): entité Client (domaine, cas d'usage, adaptateurs Mongoose, contrôleurs)"
```

---

### Task 2: Domaine `clients-sites` — entité `Site` (avec relation `Client`)

**Files:**
- Create: `src/backend/clients-sites/domain/site.ts` ; modifier `domain/ports.ts` (ajouter `SiteRepository`), `domain/erreurs.ts` (ajouter `SiteIntrouvable`) ; créer `application/cas-d-usage-sites.ts` (+ `.test.ts`), `infrastructure/en-memoire/site.repository.en-memoire.ts`, `infrastructure/mongoose/{site.model,site.repository.mongoose}.ts` (+ `site.repository.mongoose.test.ts`), `http/{sites.liste.controleur,sites.detail.controleur}.ts`
- Create (filet) : compléter `tests/integration/clients-sites-caracterisation.test.ts` avec la section sites
- Move: `src/models/Site.ts` → `src/backend/clients-sites/infrastructure/mongoose/site.model.ts` ; `src/lib/validators/site.ts` → `src/backend/clients-sites/http/site.schema.ts`
- Modify: `src/app/api/sites/route.ts`, `src/app/api/sites/[id]/route.ts`, `src/backend/platform/base-de-donnees/enregistrement-modeles.ts` (ligne `Site`, ordre conservé), `composition.ts` (ajouter `casDUsageSites`), `http/presentation.ts` (ajouter `versReponseSite`), importeurs (codemod), `tests/architecture/regles-de-dependance.test.ts`

**Interfaces:**
- Produit : `Site`, `SiteSaisie` (`clientId` en chaîne) ; `SiteRepository` ; `creerCasDUsageSites({ sites })` → `{ lister, obtenir, creer, modifier, supprimer }` ; erreur `SiteIntrouvable` (message `"Non trouvé"`) ; `composition.ts` exporte aussi `casDUsageSites`.
- Consomme : même socle transitoire que la tâche 1 (`@/lib/api-auth`, `@/shared/acces/permissions`) ; le modèle `Client` de la tâche 1 (même domaine, import relatif autorisé) pour le `.populate("clientId", "nom")`.

- [ ] **Step 1: Compléter la caractérisation — routes sites**, dans `tests/integration/clients-sites-caracterisation.test.ts` (même fichier que la tâche 1, nouvelle section `describe`). Couvrir au minimum pour `@/app/api/sites/route` et `@/app/api/sites/[id]/route` :
  - Liste triée par `nom`, avec **valeurs**, et **forme peuplée** : `clientId` dans la réponse d'un GET (liste et détail) est un objet `{_id, nom}` (vérifier avec un client réel créé au préalable), alors que dans la réponse d'un POST/PUT `clientId` reste une **chaîne** (pas de populate à l'écriture) — capturer les deux formes exactement en comparant au comportement observé en lançant le test (ne pas préjuger de la forme exacte de `localisation` absente : écrire l'assertion, lancer le test sur le code actuel, ajuster l'assertion au résultat réel sans jamais toucher la route).
  - Filtre `?clientId=` sur la liste (déjà couvert par `tests/integration/referentiels-api.test.ts`, ne pas dupliquer — vérifier seulement qu'il continue de passer).
  - POST 201 avec l'ensemble exact de clés (`_id, clientId, nom, adresse, localisation, typeDechets, observations, createdAt, updatedAt, __v` ou le sous-ensemble réellement présent) ; POST 400 (`clientId` vide, `nom` vide, corps de types faux) ; **POST avec un `clientId` inexistant réussit quand même (201)** — aucune vérification d'existence à l'écriture, comportement à préserver.
  - GET par id 200 / 404 / 400.
  - PUT 200 (sans populate) / 404 / 400 corps / 400 identifiant.
  - DELETE 200 `{success:true}` **sans aucune garde** (un site référencé par une opération, si applicable, ou par rien de particulier, se supprime toujours) / 404 / 400 identifiant.
  - 401 sans session ; 403 `chauffeur` ; 403 `MUST_CHANGE_PASSWORD` sur écriture ; corps JSON malformé POST/PUT.

  Lancer : `npx vitest run tests/integration/clients-sites-caracterisation.test.ts` → **PASS** (fichier complet, sections clients + sites). Commit isolé :

```bash
git add tests/integration/clients-sites-caracterisation.test.ts
git commit -m "test(clients-sites): tests de caractérisation sites avant migration"
```

- [ ] **Step 2: Domaine, ports, faux en mémoire.**

```ts
// src/backend/clients-sites/domain/site.ts
export interface Site {
  id: string;
  clientId: string;
  nom: string;
  adresse: string;
  localisation?: { lat: number; lng: number };
  typeDechets: string[];
  observations: string;
  createdAt: Date;
  updatedAt: Date;
  revision?: number;
}

export interface SiteSaisie {
  clientId: string;
  nom: string;
  adresse: string;
  localisation?: { lat: number; lng: number };
  typeDechets: string[];
  observations: string;
}

/** Forme d'un site dont le `clientId` a été peuplé (nom du client), pour les réponses des routes de lecture. */
export interface SiteAvecClientPeuple extends Omit<Site, "clientId"> {
  clientId: string | { id: string; nom: string };
}
```

Ajouter dans `src/backend/clients-sites/domain/erreurs.ts` :

```ts
export class SiteIntrouvable extends Error {
  constructor() {
    super("Non trouvé");
    this.name = "SiteIntrouvable";
  }
}
```

Ajouter dans `src/backend/clients-sites/domain/ports.ts` :

```ts
import type { Site, SiteSaisie, SiteAvecClientPeuple } from "./site";

export interface SiteRepository {
  /** Tous les sites, ou filtrés par `clientId` si fourni ; triés par nom croissant ; `clientId` peuplé (`{id, nom}`). */
  lister(clientId?: string): Promise<SiteAvecClientPeuple[]>;
  /** `clientId` peuplé (`{id, nom}`). */
  trouverParId(id: string): Promise<SiteAvecClientPeuple | null>;
  /** `clientId` NON peuplé (chaîne), comme l'API actuelle (pas de populate à l'écriture). */
  creer(saisie: SiteSaisie): Promise<Site>;
  /** `clientId` NON peuplé ; null si le site n'existe pas. */
  modifier(id: string, saisie: SiteSaisie): Promise<Site | null>;
  /** false si le site n'existait pas ; aucun contrôle de rattachement. */
  supprimer(id: string): Promise<boolean>;
}
```

```ts
// src/backend/clients-sites/infrastructure/en-memoire/site.repository.en-memoire.ts
import type { Site, SiteSaisie, SiteAvecClientPeuple } from "../../domain/site";
import type { SiteRepository } from "../../domain/ports";

/** Dépôt en mémoire pour les tests des cas d'usage. La « population » du client y est
 * simulée par un nom fixe : les tests de cas d'usage ne portent pas sur son contenu réel
 * (couvert par le test de contrat Mongoose), seulement sur sa présence en lecture. */
export class SiteRepositoryEnMemoire implements SiteRepository {
  private readonly donnees = new Map<string, Site>();
  private compteur = 0;

  private peupler(site: Site): SiteAvecClientPeuple {
    return { ...site, clientId: { id: site.clientId, nom: `client-${site.clientId}` } };
  }

  async lister(clientId?: string): Promise<SiteAvecClientPeuple[]> {
    const valeurs = [...this.donnees.values()].filter((s) => !clientId || s.clientId === clientId);
    return valeurs.sort((a, b) => (a.nom < b.nom ? -1 : a.nom > b.nom ? 1 : 0)).map((s) => this.peupler(s));
  }

  async trouverParId(id: string): Promise<SiteAvecClientPeuple | null> {
    const site = this.donnees.get(id);
    return site ? this.peupler(site) : null;
  }

  async creer(saisie: SiteSaisie): Promise<Site> {
    this.compteur += 1;
    const maintenant = new Date();
    const site: Site = { id: `site-${this.compteur}`, ...saisie, createdAt: maintenant, updatedAt: maintenant, revision: 0 };
    this.donnees.set(site.id, site);
    return site;
  }

  async modifier(id: string, saisie: SiteSaisie): Promise<Site | null> {
    const existant = this.donnees.get(id);
    if (!existant) return null;
    const modifie: Site = { ...existant, ...saisie, updatedAt: new Date() };
    this.donnees.set(id, modifie);
    return modifie;
  }

  async supprimer(id: string): Promise<boolean> {
    return this.donnees.delete(id);
  }
}
```

- [ ] **Step 3: Test des cas d'usage (rouge), puis cas d'usage (vert).**

```ts
// src/backend/clients-sites/application/cas-d-usage-sites.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { creerCasDUsageSites } from "./cas-d-usage-sites";
import { SiteIntrouvable } from "../domain/erreurs";
import { SiteRepositoryEnMemoire } from "../infrastructure/en-memoire/site.repository.en-memoire";

let sites: SiteRepositoryEnMemoire;
const saisie = (clientId: string, nom: string) => ({ clientId, nom, adresse: "", typeDechets: [], observations: "" });

beforeEach(() => {
  sites = new SiteRepositoryEnMemoire();
});

describe("cas d'usage des sites", () => {
  it("liste les sites triés par nom, filtrés par clientId si fourni", async () => {
    const cas = creerCasDUsageSites({ sites });
    await cas.creer(saisie("c1", "Beta"));
    await cas.creer(saisie("c2", "Alpha"));
    expect((await cas.lister()).map((s) => s.nom)).toEqual(["Alpha", "Beta"]);
    expect((await cas.lister("c1")).map((s) => s.nom)).toEqual(["Beta"]);
  });

  it("crée sans vérifier l'existence du client, puis obtient un site avec sa révision initiale", async () => {
    const cas = creerCasDUsageSites({ sites });
    const cree = await cas.creer(saisie("client-inexistant", "Alpha"));
    expect(cree.revision).toBe(0);
    expect(await cas.obtenir(cree.id)).toMatchObject({ nom: "Alpha" });
  });

  it("obtenir un site inconnu lève SiteIntrouvable", async () => {
    const cas = creerCasDUsageSites({ sites });
    await expect(cas.obtenir("inconnu")).rejects.toBeInstanceOf(SiteIntrouvable);
  });

  it("modifie un site existant et refuse un site inconnu", async () => {
    const cas = creerCasDUsageSites({ sites });
    const cree = await cas.creer(saisie("c1", "Alpha"));
    expect((await cas.modifier(cree.id, saisie("c1", "Alpha modifié"))).nom).toBe("Alpha modifié");
    await expect(cas.modifier("inconnu", saisie("c1", "X"))).rejects.toBeInstanceOf(SiteIntrouvable);
  });

  it("supprime un site sans aucun contrôle de rattachement et refuse un site inconnu", async () => {
    const cas = creerCasDUsageSites({ sites });
    const cree = await cas.creer(saisie("c1", "Alpha"));
    await cas.supprimer(cree.id);
    await expect(cas.obtenir(cree.id)).rejects.toBeInstanceOf(SiteIntrouvable);
    await expect(cas.supprimer(cree.id)).rejects.toBeInstanceOf(SiteIntrouvable);
  });
});
```

Run : `npx vitest run src/backend/clients-sites/application` → FAIL (module absent). Puis :

```ts
// src/backend/clients-sites/application/cas-d-usage-sites.ts
import type { Site, SiteSaisie, SiteAvecClientPeuple } from "../domain/site";
import { SiteIntrouvable } from "../domain/erreurs";
import type { SiteRepository } from "../domain/ports";

export interface DependancesSites {
  sites: SiteRepository;
}

export function creerCasDUsageSites({ sites }: DependancesSites) {
  return {
    lister(clientId?: string): Promise<SiteAvecClientPeuple[]> {
      return sites.lister(clientId);
    },

    async obtenir(id: string): Promise<SiteAvecClientPeuple> {
      const site = await sites.trouverParId(id);
      if (!site) throw new SiteIntrouvable();
      return site;
    },

    creer(saisie: SiteSaisie): Promise<Site> {
      // Aucune vérification que `clientId` référence un client existant : identique à la route d'origine.
      return sites.creer(saisie);
    },

    async modifier(id: string, saisie: SiteSaisie): Promise<Site> {
      const site = await sites.modifier(id, saisie);
      if (!site) throw new SiteIntrouvable();
      return site;
    },

    async supprimer(id: string): Promise<void> {
      // Aucun contrôle de rattachement : identique à la route d'origine.
      if (!(await sites.supprimer(id))) throw new SiteIntrouvable();
    },
  };
}

export type CasDUsageSites = ReturnType<typeof creerCasDUsageSites>;
```

Run : `npx vitest run src/backend/clients-sites/application` → PASS (les deux fichiers, clients et sites).

- [ ] **Step 4: Modèle déplacé (codemods), adaptateur Mongoose (avec populate), test de contrat.**

```bash
git mv src/models/Site.ts src/backend/clients-sites/infrastructure/mongoose/site.model.ts
git mv src/lib/validators/site.ts src/backend/clients-sites/http/site.schema.ts
node scripts/dev/remplacer-imports.mjs "@/models/Site" "@/backend/clients-sites/infrastructure/mongoose/site.model"
node scripts/dev/remplacer-imports.mjs "@/lib/validators/site" "@/backend/clients-sites/http/site.schema"
git diff --stat
```

Relire `git diff --stat`, annuler les modifications collatérales. Mettre à jour `scripts/seed-admin.ts` (import relatif, jamais exécuté) et, dans `enregistrement-modeles.ts`, remplacer `import "@/models/Site";` par `import "@/backend/clients-sites/infrastructure/mongoose/site.model";` **à la même place** (2ᵉ ligne).

**Point de vigilance (référence circulaire évitée) :** `site.model.ts` référence `Client` uniquement par la chaîne `ref: "Client"` (déjà le cas avant migration) — Mongoose résout la référence par le nom du modèle enregistré globalement, pas par un import direct. **Ne pas** importer `client.model.ts` depuis `site.model.ts`. `enregistrement-modeles.ts` garantit que les deux modèles sont enregistrés avant tout `populate`.

```ts
// src/backend/clients-sites/infrastructure/mongoose/site.repository.mongoose.ts
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type { Site, SiteSaisie, SiteAvecClientPeuple } from "../../domain/site";
import type { SiteRepository } from "../../domain/ports";
import { Site as SiteModel } from "./site.model";

interface DocumentSite {
  _id: unknown;
  clientId: unknown; // ObjectId brut (écriture) ou { _id, nom } (lecture, après .populate)
  nom: string;
  adresse?: string;
  localisation?: { lat: number; lng: number };
  typeDechets?: string[];
  observations?: string;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

function estPeuple(clientId: unknown): clientId is { _id: unknown; nom: string } {
  return Boolean(clientId) && typeof clientId === "object" && "nom" in (clientId as object);
}

function versEntitePeuplee(doc: DocumentSite): SiteAvecClientPeuple {
  return {
    id: String(doc._id),
    clientId: estPeuple(doc.clientId) ? { id: String(doc.clientId._id), nom: doc.clientId.nom } : String(doc.clientId),
    nom: doc.nom,
    adresse: doc.adresse ?? "",
    localisation: doc.localisation,
    typeDechets: doc.typeDechets ?? [],
    observations: doc.observations ?? "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    revision: doc.__v,
  };
}

function versEntite(doc: DocumentSite): Site {
  return {
    id: String(doc._id),
    clientId: estPeuple(doc.clientId) ? String(doc.clientId._id) : String(doc.clientId),
    nom: doc.nom,
    adresse: doc.adresse ?? "",
    localisation: doc.localisation,
    typeDechets: doc.typeDechets ?? [],
    observations: doc.observations ?? "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    revision: doc.__v,
  };
}

export class SiteRepositoryMongoose implements SiteRepository {
  async lister(clientId?: string): Promise<SiteAvecClientPeuple[]> {
    await connectDB();
    const filtre = clientId ? { clientId } : {};
    const docs = (await SiteModel.find(filtre)
      .populate("clientId", "nom")
      .sort({ nom: 1 })
      .lean()) as DocumentSite[];
    return docs.map(versEntitePeuplee);
  }

  async trouverParId(id: string): Promise<SiteAvecClientPeuple | null> {
    await connectDB();
    const doc = (await SiteModel.findById(id).populate("clientId", "nom").lean()) as DocumentSite | null;
    return doc ? versEntitePeuplee(doc) : null;
  }

  async creer(saisie: SiteSaisie): Promise<Site> {
    await connectDB();
    const doc = await SiteModel.create(saisie);
    return versEntite(doc.toObject() as DocumentSite);
  }

  async modifier(id: string, saisie: SiteSaisie): Promise<Site | null> {
    await connectDB();
    const doc = (await SiteModel.findByIdAndUpdate(id, saisie, { new: true }).lean()) as DocumentSite | null;
    return doc ? versEntite(doc) : null;
  }

  async supprimer(id: string): Promise<boolean> {
    await connectDB();
    return Boolean(await SiteModel.findByIdAndDelete(id));
  }
}
```

Test de contrat `src/backend/clients-sites/infrastructure/mongoose/site.repository.mongoose.test.ts` (importer aussi `Client as ClientModel` depuis `./client.model` pour créer un client réel) couvrant : création + relecture (`clientId` non peuplé après `creer`) ; `trouverParId`/`lister` retournent `clientId` peuplé `{id, nom}` ; filtre par `clientId` ; modification (+ `null` sur id inconnu) ; suppression (+ `false` sur id inconnu) ; **`creer` avec un `clientId` inexistant ne lève pas d'erreur** (pas de contrainte FK côté Mongo).

Run : `npx vitest run src/backend/clients-sites/infrastructure` → PASS.

- [ ] **Step 5: Contrôleurs, composition (complétée), routes.**

Dans `src/backend/clients-sites/http/site.schema.ts` (fichier déplacé, contenu inchangé) : ajouter **en haut** `import type { SiteSaisie } from "../domain/site";` et à la suite :

```ts
export function versSaisieSite(entree: SiteInput): SiteSaisie {
  return {
    clientId: entree.clientId,
    nom: entree.nom,
    adresse: entree.adresse,
    localisation: entree.localisation,
    typeDechets: entree.typeDechets,
    observations: entree.observations,
  };
}
```

Compléter `src/backend/clients-sites/http/presentation.ts` :

```ts
import type { Site, SiteAvecClientPeuple } from "../domain/site";

function versClientJson(clientId: SiteAvecClientPeuple["clientId"]) {
  return typeof clientId === "string" ? clientId : { _id: clientId.id, nom: clientId.nom };
}

/** Forme JSON historique de l'API pour une lecture (liste/détail), `clientId` peuplé. */
export function versReponseSitePeuple(site: SiteAvecClientPeuple) {
  return {
    _id: site.id,
    clientId: versClientJson(site.clientId),
    nom: site.nom,
    adresse: site.adresse,
    localisation: site.localisation,
    typeDechets: site.typeDechets,
    observations: site.observations,
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
    __v: site.revision,
  };
}

/** Forme JSON historique de l'API pour une écriture (création/modification), `clientId` non peuplé. */
export function versReponseSite(site: Site) {
  return {
    _id: site.id,
    clientId: site.clientId,
    nom: site.nom,
    adresse: site.adresse,
    localisation: site.localisation,
    typeDechets: site.typeDechets,
    observations: site.observations,
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
    __v: site.revision,
  };
}
```

Compléter `src/backend/clients-sites/composition.ts` :

```ts
import { creerCasDUsageSites } from "./application/cas-d-usage-sites";
import { SiteRepositoryMongoose } from "./infrastructure/mongoose/site.repository.mongoose";

export const casDUsageSites = creerCasDUsageSites({ sites: new SiteRepositoryMongoose() });
```

```ts
// src/backend/clients-sites/http/sites.liste.controleur.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireReferentialRead } from "@/lib/api-auth"; // transitoire : migre avec comptes (R3)
import { isClientUser } from "@/shared/acces/permissions";
import { casDUsageSites } from "../composition";
import { siteSchema, versSaisieSite } from "./site.schema";
import { versReponseSitePeuple, versReponseSite } from "./presentation";

export async function GET(req: NextRequest) {
  const auth = await requireReferentialRead();
  if (auth.error) return auth.error;

  const clientId = isClientUser(auth.role) ? auth.clientId : req.nextUrl.searchParams.get("clientId");
  const sites = await casDUsageSites.lister(clientId ?? undefined);
  return NextResponse.json(sites.map(versReponseSitePeuple));
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const body = await req.json();
  const parsed = siteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const site = await casDUsageSites.creer(versSaisieSite(parsed.data));
  return NextResponse.json(versReponseSite(site), { status: 201 });
}
```

```ts
// src/backend/clients-sites/http/sites.detail.controleur.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireReferentialRead, isWithinClientScope } from "@/lib/api-auth"; // transitoire : migre avec comptes (R3)
import { guardObjectId } from "@/backend/platform/http/identifiants";
import { SiteIntrouvable } from "../domain/erreurs";
import { casDUsageSites } from "../composition";
import { siteSchema, versSaisieSite } from "./site.schema";
import { versReponseSitePeuple, versReponseSite } from "./presentation";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireReferentialRead();
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  let site;
  try {
    site = await casDUsageSites.obtenir(id);
  } catch (error) {
    if (error instanceof SiteIntrouvable) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
  const clientIdBrut = typeof site.clientId === "string" ? site.clientId : site.clientId.id;
  if (!isWithinClientScope(auth, clientIdBrut)) {
    return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  }
  return NextResponse.json(versReponseSitePeuple(site));
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  const body = await req.json();
  const parsed = siteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    return NextResponse.json(versReponseSite(await casDUsageSites.modifier(id, versSaisieSite(parsed.data))));
  } catch (error) {
    if (error instanceof SiteIntrouvable) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;
  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;

  try {
    await casDUsageSites.supprimer(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof SiteIntrouvable) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
```

```ts
// src/app/api/sites/route.ts
export { GET, POST } from "@/backend/clients-sites/http/sites.liste.controleur";
```

```ts
// src/app/api/sites/[id]/route.ts
export { GET, PUT, DELETE } from "@/backend/clients-sites/http/sites.detail.controleur";
```

- [ ] **Step 6: Déclarer le domaine migré.** Dans `tests/architecture/regles-de-dependance.test.ts` : `domainesBackendMigres: ["equipes", "vehicules", "equipements", "clients-sites"]` ; `npx vitest run tests/architecture` → PASS. Prouver que la règle mord : ajouter **temporairement** `import "mongoose";` dans `src/backend/clients-sites/application/cas-d-usage-sites.ts`, constater l'échec `R2`, annuler.

- [ ] **Step 7: Vérifier**

Run: `npx tsc --noEmit && echo "tsc ok" && npm run lint 2>&1 | tail -1 && npx vitest run 2>&1 | grep -E "Test Files|Tests "`
Expected : tout vert ; `clients-sites-caracterisation`, `referentiels-api`, `referentiels-delete-guard`, `authz-roles`, `chauffeur-scope`, `api-auth`, `operations-api`, `recurrences-api`, `client-scope`, `validators` passent avec **seulement** des changements de chemins d'import. Puis `verifier-build` (plan maître) → succès.

- [ ] **Step 8: Commit**

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports'
git status --short | head -30
git commit -m "refactor(clients-sites): entité Site (domaine, cas d'usage, adaptateurs Mongoose, contrôleurs)"
```

---

### Task 3: Fonctionnalité frontend `clients-sites`

**Files:**
- Create: `src/frontend/clients-sites/{composants/ClientsPageClient.tsx,api/chemins.ts,index.ts}`
- Move (contenu identique) : `src/components/clients/ClientsPageClient.tsx` → `src/frontend/clients-sites/composants/ClientsPageClient.tsx`
- Modify: `src/app/(dashboard)/clients/page.tsx`, `tests/architecture/regles-de-dependance.test.ts`
- Delete: dossier `src/components/clients/` (vide après déplacement)

**Interfaces:**
- Produit : `ClientsPageClient()` (composant, inchangé) ; `CHEMIN_API_CLIENTS = "/api/clients"`, `CHEMIN_API_SITES = "/api/sites"`.
- Consomme : `EntityModal` (`@/frontend/design-system/EntityModal`), `canWrite` (`@/shared/acces/permissions`).

- [ ] **Step 1: Déplacer le composant tel quel.**

```bash
mkdir -p src/frontend/clients-sites/composants src/frontend/clients-sites/api
git mv src/components/clients/ClientsPageClient.tsx src/frontend/clients-sites/composants/ClientsPageClient.tsx
```

Le contenu du fichier ne change pas (mêmes imports relatifs vers `@/frontend/design-system/EntityModal` et `@/shared/acces/permissions`, déjà valides depuis le nouvel emplacement). Vérifier avec `git diff --stat` qu'aucune ligne n'a été modifiée par le déplacement, seul le chemin change.

**Optionnel (cohérence avec `vehicules`/`equipements`, sans effet observable) :** remplacer les deux chaînes littérales `"/api/clients"` et `"/api/sites"` dans le composant par les constantes ci-dessous, si cela n'allonge pas la revue de façon disproportionnée ; sinon laisser les chaînes littérales telles quelles (le composant n'est pas décrit comme un modèle à suivre à la lettre sur ce point, contrairement à `PageReferentiel`).

```ts
// src/frontend/clients-sites/api/chemins.ts
export const CHEMIN_API_CLIENTS = "/api/clients";
export const CHEMIN_API_SITES = "/api/sites";
```

```ts
// src/frontend/clients-sites/index.ts
export { ClientsPageClient } from "./composants/ClientsPageClient";
```

- [ ] **Step 2: Réduire la page `src/app`**

```tsx
// src/app/(dashboard)/clients/page.tsx
import { ClientsPageClient } from "@/frontend/clients-sites";
import { requirePageAccess } from "@/lib/page-auth";

export default async function ClientsPage() {
  await requirePageAccess("/clients");
  return <ClientsPageClient />;
}
```

Comparer avec `git show HEAD:src/app/\(dashboard\)/clients/page.tsx` avant de remplacer : seul le chemin d'import de `ClientsPageClient` change (`@/components/clients/ClientsPageClient` → `@/frontend/clients-sites`).

- [ ] **Step 3: Nettoyer le dossier vide.** `rmdir src/components/clients` (échoue silencieusement s'il reste un fichier — dans ce cas, ne rien supprimer et signaler dans le rapport).

- [ ] **Step 4: Déclarer la fonctionnalité migrée** : `fonctionnalitesFrontendMigrees: ["equipes", "vehicules", "equipements", "clients-sites"]` ; `npx vitest run tests/architecture tests/unit/page-guards.test.ts` → PASS ; prouver la règle R4 par injection temporaire d'un import `@/backend/platform/http/identifiants` dans `ClientsPageClient.tsx` (échec du test d'architecture **et** de `npm run lint`), puis annuler.

- [ ] **Step 5: Vérifier** — `tsc`, `lint`, `vitest` complets, `verifier-build`.

- [ ] **Step 6: Commit**

```bash
git add -A -- . ':!.agents' ':!.claude' ':!skills-lock.json' ':!rapports'
git commit -m "refactor(clients-sites): fonctionnalité frontend clients-sites"
```

---

### Task 4: Documentation, statuts et revue du jalon

**Files:** `README.md`, `docs/superpowers/plans/2026-09-20-refactor-architecture-master.md`, `docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md`

- [ ] **Step 1: README.** Dans la section « Architecture », mettre à jour la liste des domaines migrés (`equipes`, `vehicules`, `equipements`, `clients-sites`) et celle des domaines encore dans les dossiers hérités ; vérifier que chaque chemin cité existe.
- [ ] **Step 2: Statuts.** Spec : « R0, R1 et R2 réalisés ; jalons R3 à R9 à venir ». Plan maître : ligne R2 → **Réalisé** ; ajouter dans « Enseignements » : « R2 : premier domaine à deux entités liées (`Client`, `Site`) — un seul dossier de domaine, deux fabriques de cas d'usage (`creerCasDUsageClients`, `creerCasDUsageSites`) et un seul `composition.ts` ; le `.populate()` Mongoose se reproduit dans l'adaptateur sans dépendance d'import entre les deux modèles (résolution par nom de modèle enregistré) ; le filtrage par périmètre d'un compte `client` reste entièrement dans les contrôleurs (le domaine ignore les rôles). »
- [ ] **Step 3: Vérification complète** : `npx tsc --noEmit && npm run lint && npx vitest run`, puis `verifier-build`.
- [ ] **Step 4: Non-régression ciblée** (à consigner dans le rapport) : `git diff main --stat -- tests/integration tests/unit` — les tests existants ne changent que par des chemins d'import (lister tout autre changement) ; comparer les réponses JSON des routes `clients` et `sites` avant/après avec la méthode de R0/R1 (archive de `main` et de la branche, même sonde, corps bruts) sur au moins : liste clients et sites (avec et sans compte `client`, avec et sans `?clientId=`), POST 201/400 (les deux entités), GET par id 200/404/400 (les deux entités, avec et sans compte `client` hors périmètre), PUT 200/404 (les deux entités), DELETE 200/404/409 (client rattaché), DELETE 200 site (aucune garde), sans session (401), chauffeur (403).
- [ ] **Step 5: Commit**

```bash
git add README.md docs/superpowers
git commit -m "docs: statuts du jalon R2 et domaine clients-sites migré"
```

- [ ] **Step 6: Revue du jalon** (skill `superpowers:requesting-code-review`, modèle le plus capable). Critères : aucun changement de comportement sur les 8 routes (`clients` × 4, `sites` × 4) — y compris le périmètre `isWithinClientScope`, l'absence de garde de suppression sur `Site`, l'absence de vérification d'existence du client à la création d'un site, et la forme peuplée/non peuplée de `clientId` selon la route ; règles R1 à R5 réellement appliquées (injections dans `clients-sites`) ; codemods sans import oublié (`@/models/Client`, `@/models/Site`, `@/lib/validators/client`, `@/lib/validators/site` introuvables) ; tests existants inchangés hors chemins ; composant frontend strictement identique à l'ancien (`git diff` du contenu, hors chemin du fichier) ; `enregistrement-modeles.ts` dans le même ordre ; CI verte sur clone propre.

---

## Auto-relecture

- **Couverture de la spec (jalon R2) :** entité `Client` avec garde de suppression (tâche 1) ; entité `Site` avec relation peuplée et sans garde (tâche 2) ; frontend (tâche 3) ; documentation et revue (tâche 4).
- **Cohérence des noms :** `Client/ClientSaisie/ClientRepository/ClientIntrouvable/ClientRattache/creerCasDUsageClients/casDUsageClients/ClientRepositoryEnMemoire/ClientRepositoryMongoose` (tâche 1) et `Site/SiteSaisie/SiteAvecClientPeuple/SiteRepository/SiteIntrouvable/creerCasDUsageSites/casDUsageSites/SiteRepositoryEnMemoire/SiteRepositoryMongoose` (tâche 2) sont tous définis avant leur premier usage ; `ClientsPageClient/CHEMIN_API_CLIENTS/CHEMIN_API_SITES` à la tâche 3.
- **Points de vigilance :** (1) `Site` n'a et ne doit avoir **aucune** garde de suppression ni vérification d'existence du client au moment de la création — ce n'est pas un oubli, c'est le comportement actuel à préserver ; (2) `clientId` a deux représentations JSON selon la route (peuplée en lecture, chaîne brute en écriture) — les deux fonctions de présentation (`versReponseSitePeuple`, `versReponseSite`) ne doivent jamais être interverties ; (3) le port `RattachementsUtilisateurs` de `clients-sites` (méthode `existePourClient`) est un type distinct du port homonyme de `equipes` (méthode `existePourEquipe`) — chaque domaine définit le sien, il n'y a pas de partage entre domaines ; (4) `operations`, `dashboard/stats`, `import`, `(dashboard)/page.tsx` et `src/lib/users/scope.ts` continuent d'importer les modèles déplacés directement (toléré, corrigé aux jalons R3/R4/R9) ; (5) `scripts/seed-admin.ts` est modifié par le codemod mais **jamais exécuté** pendant ce jalon.
