# Refactoring R4d — Domaine `operations` : rapport PDF : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire passer la génération du rapport PDF d'intervention par l'architecture hexagonale : port `GenerateurRapportPdf`, adaptateur jsPDF, cas d'usage, contrôleur ; `[id]/rapport/route.ts` devient un ré-export. Dernier des quatre sous-plans de R4 : à son issue, plus aucune route d'`operations` n'est héritée.

**Architecture:** `domain/rapport.ts` (référence et nom de fichier), port `GenerateurRapportPdf` dans `domain/ports.ts`, `application/cas-d-usage-rapport.ts` (lecture par `obtenir` — même niveau de peuplement « détail » et même périmètre que la route d'origine —, puis génération datée par l'horloge), `infrastructure/pdf/generateur-rapport.jspdf.ts` (le dessin du PDF, transposé tel quel sur l'entité `Operation`), `http/rapport.controleur.ts`. jsPDF reste confiné à `infrastructure/`.

**Tech Stack:** Next.js 16, TypeScript, jsPDF 4 + jspdf-autotable 5, Vitest + mongodb-memory-server.

**Spec / feuille de route:** `docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md` (§6 : « générer le rapport | `GenerateurRapportPdf` » ; §3 : `infrastructure/ … pdf/`) ; `docs/superpowers/plans/2026-09-20-refactor-architecture-master.md`.

## Global Constraints

- **Aucun changement de comportement** : mêmes codes, mêmes en-têtes (`Content-Type: application/pdf`, `Content-Disposition: attachment; filename="rapport-<8 derniers caractères de l'identifiant, en majuscules>.pdf"`), même ordre des vérifications (`requireAuth()` → chauffeur sans équipe 403 → identifiant 400 → lecture → introuvable 404 → périmètre client 404 → périmètre équipe 404), **même PDF** : mêmes textes, mêmes positions, mêmes sauts de page. Le rapport n'est jamais réécrit dans l'opération.
- Écarts connus et acceptés (plan maître) : une opération dont un champ du schéma est absent ou `null` en base est lue avec la valeur par défaut du schéma (ici : « 120 min » au lieu de « undefined min »).
- Les tests existants ne changent que par leurs chemins d'import. À chaque commit : `npx tsc --noEmit`, `npm run lint` (0 erreur), `npx vitest run` verts (**1217 tests / 87 fichiers au départ**, `main` `2cd711d`).
- `domain/` et `application/` n'importent ni `jspdf`, ni `mongoose`, ni `next`, ni `platform`. `http/` n'atteint `infrastructure/` que par `composition.ts`.
- Ne jamais lire `.env.local` ; ne jamais lancer `npm run build`/`seed`. Ne jamais stager `.agents/`, `.claude/`, `skills-lock.json`, `rapports/`, `package.json`.
- Branche `refactor/r4d-operations-rapport` (déjà créée depuis `main`). Fusion locale après revue ; aucun push sans accord.

### Faits vérifiés sur le code actuel

Épinglés par `tests/integration/operations-rapport-caracterisation.test.ts` (7 tests, **déjà écrit et vert sur `main`**) : en-têtes exacts ; textes présents en clair dans le PDF (police standard, sans compression) ; opération minimale = 1 page sans les sections facultatives ; opération complète = 3 pages (la signature puis les photos ouvrent chacune une page) ; relevé des quantités seulement si `quantiteCollectee > 0` ; remarques vides → « Aucune » ; client ou équipe supprimés → rapport produit (« — », « Non affectée ») ; rien n'est écrit en base ; ordre des refus ; périmètre (404).

Le dessin (`src/app/api/operations/[id]/rapport/route.ts`, lignes 73-270 sur `main`) : bandeau vert, référence et date de génération (`new Date().toLocaleDateString("fr-FR")`), tableau d'informations, relevé des quantités, historique (saut de page si `y > 220`), signature (saut si `y > 180`, repli « (Signature enregistrée) » si l'image est illisible), photos sur une nouvelle page (grille de 50 mm, repli « [Photo n non affichable] »), pied de page numéroté.

## Review Focus

1. **Relation supprimée ou non peuplée** (client, site, équipe, véhicule, auteur d'historique) : le rapport sort avec les replis « — », « Non affectée », « Non affecté » — tâche 2 (test du générateur) et filet.
2. **Image illisible** (signature ou photo qui n'est pas une image valide) : repli textuel, pas d'exception — tâche 2.
3. **Hors périmètre** (autre client, autre équipe) : 404 sans générer de PDF — tâche 3 (cas d'usage) et filet.
4. **Date de génération** : celle de l'horloge injectée — tâches 2 et 3.
5. **Parité octet pour octet avec l'ancien rapport** (hors date de création et identifiant de fichier, aléatoires) sur trois opérations types — tâche 4, sonde ponctuelle avant la bascule.

---

### Task 1 : Filet

- [ ] Vérifier `npx vitest run tests/integration/operations-rapport-caracterisation.test.ts` → 7 PASS sur le code actuel ; suite complète **1224 tests** ; commit `test(operations): caractérisation du rapport PDF d'intervention`.

### Task 2 : Règle de nommage, port et adaptateur jsPDF

**Files:** créer `src/backend/operations/domain/rapport.ts` (+ test), `src/backend/operations/infrastructure/pdf/generateur-rapport.jspdf.ts` (+ test) ; compléter `src/backend/operations/domain/ports.ts`.

**Interfaces produites:**
```ts
// domain/rapport.ts
export function referenceRapport(operationId: string): string;      // 8 derniers caractères, en majuscules
export function nomFichierRapport(operationId: string): string;     // "rapport-<référence>.pdf"
// domain/ports.ts
export interface GenerateurRapportPdf { generer(operation: Operation, genereLe: Date): Promise<Uint8Array> }
// infrastructure/pdf/generateur-rapport.jspdf.ts
export class GenerateurRapportJsPdf implements GenerateurRapportPdf {}
```

- [ ] Tests d'abord (échec constaté), puis code. Le générateur reprend le dessin d'origine **ligne pour ligne** ; seules changent les lectures de données (entité `Operation` : `operation.id`, relations lues par une aide `champ(reference, cle)` qui renvoie `undefined` pour une relation absente, pendante ou non peuplée) et la date de génération (`genereLe` au lieu de `new Date()`).
- [ ] `npx tsc --noEmit && npm run lint && npx vitest run tests/architecture` puis suite complète ; commit `refactor(operations): port GenerateurRapportPdf et adaptateur jsPDF (dessin transposé sur l'entité)`.

### Task 3 : Cas d'usage

**Files:** créer `src/backend/operations/application/cas-d-usage-rapport.ts` (+ test) ; modifier `src/backend/operations/composition.ts`.

**Interfaces produites:**
```ts
export interface RapportGenere { contenu: Uint8Array; nomFichier: string }
export function creerCasDUsageRapport(deps: {
  obtenir: (acteur: Acteur, id: string) => Promise<Operation>;   // celui de casDUsageOperations : périmètre + niveau détail
  generateur: GenerateurRapportPdf;
  horloge: Horloge;
}): { generer(acteur: Acteur, id: string): Promise<RapportGenere> };
// composition.ts
export const casDUsageRapport: ReturnType<typeof creerCasDUsageRapport>;
```

- [ ] Tests d'abord (faux générateur qui enregistre ses appels) : l'opération lue et la date de l'horloge sont transmises au générateur ; nom de fichier ; une erreur de lecture (`OperationIntrouvable`, `ChauffeurSansEquipe`) remonte **sans** appeler le générateur. Puis code, composition ; commit `refactor(operations): cas d'usage de génération du rapport`.

### Task 4 : Contrôleur, sonde de parité, route ré-exportée

**Files:** créer `src/backend/operations/http/rapport.controleur.ts` ; réduire `src/app/api/operations/[id]/rapport/route.ts`.

- [ ] Écrire le contrôleur (`requireAuth()` → `casDUsageOperations.verifierAccesLecture` → `guardObjectId` → `casDUsageRapport.generer` → réponse PDF ; erreurs par `versReponseErreur`).
- [ ] **Sonde de parité, avant la bascule** : test temporaire qui appelle l'ancienne route et le nouveau contrôleur sur trois opérations (minimale ; complète avec signature, photos, historique ; relations supprimées) et compare les octets après retrait des deux seules zones non déterministes (`/CreationDate (…)` et `/ID [ … ]`). Les trois doivent être identiques. Supprimer la sonde ensuite (elle ne peut pas survivre à la suppression de l'ancienne route) et consigner son résultat.
- [ ] Réduire la route à `export { GET } from "@/backend/operations/http/rapport.controleur";`.
- [ ] Oracle : `tests/integration/{operations-rapport-caracterisation,phase2-import-photos,chauffeur-scope,authz-roles,clients-sites-caracterisation}.test.ts` verts **sans modification**.
- [ ] `tsc`, lint, suite complète, `verifier-build` ; commit `refactor(operations): contrôleur du rapport PDF ; route réduite à un ré-export`.

### Task 5 : Documentation, statuts et revue

- [ ] README (« État de la migration ») : `operations` est **migré** (backend) — R4a à R4d réalisés ; plus aucune route héritée. Plan maître : ligne R4 → **« Réalisé »** ; section « Enseignements de R4d » ; mettre à jour le « Suivi tracé » : les gardes `isWithinTeamScope`/`chauffeurWithoutTeamError`/`TEAM_SCOPE_ERROR` de `comptes/http/acteur.ts` n'ont plus d'appelant dans `operations` — leur retrait (et celui de la matrice de parité de `domain/visibilite.test.ts`) est renvoyé à R9, car il supprime des tests ; `clients-sites` utilise toujours `isWithinClientScope`. Spec : « R0 à R4 réalisés ; jalons R5 à R9 à venir ».
- [ ] Non-régression ciblée : `git diff main --stat -- tests/unit tests/integration` → un seul fichier (créé en tâche 1) ; `wc -l` de la route → 1 ligne ; `grep -rn "isWithinTeamScope\|chauffeurWithoutTeamError" src/app` → rien.
- [ ] Commit `docs: statuts de clôture du jalon R4 (operations) — R4 réalisé` ; revue finale de branche.

## Auto-relecture

- **Couverture de la spec :** `GenerateurRapportPdf` (tâche 2), « générer le rapport » (tâche 3), adaptateur `infrastructure/pdf/` (tâche 2), contrôleur fin et route ré-exportée (tâche 4). R4 est complet après ce sous-plan.
- **Points de vigilance :** (1) le dessin est transposé, pas réécrit : aucune « amélioration » de mise en page ; (2) `uniteQuantite || "L"` et `remarquesTerrain || "Aucune"` gardent leur test de véracité ; (3) le relevé des quantités exige `quantiteCollectee > 0` ; (4) la sortie reste `doc.output("datauristring")` décodée en octets, comme à l'origine ; (5) jsPDF et jspdf-autotable sont importés dynamiquement, comme à l'origine (pas de coût au chargement du module) ; (6) aucune garde n'est retirée de `comptes` ici.
