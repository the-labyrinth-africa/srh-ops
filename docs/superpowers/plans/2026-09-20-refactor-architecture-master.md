# Refactoring d'architecture — Feuille de route maîtresse

> **For agentic workers:** ce document est la feuille de route du refactoring. Il ne s'exécute pas tel quel : chaque jalon Rn a son propre plan détaillé, rédigé **juste avant** son exécution (le pilote R0 valide le modèle que les suivants reproduisent). Le jalon R0 est prêt : `2026-09-20-refactor-r0-fondations-et-pilote-equipes.md`.

**Goal:** Faire reposer le backend sur une architecture hexagonale (par domaine métier) et le frontend sur une architecture « screaming » (par fonctionnalité métier), sans aucune régression.

**Spec:** `docs/superpowers/specs/2026-09-20-architecture-hexagonale-screaming-design.md` (approuvée le 20 septembre 2026). En cas de conflit entre ce plan et la spec, la spec fait foi.

## Global Constraints

- **Aucun changement de comportement** : ni code HTTP, ni forme de réponse JSON (y compris `_id`, `createdAt`, `updatedAt`, `__v` des documents Mongoose), ni message d'erreur, ni règle métier, ni libellé d'interface.
- Les tests existants ne changent que par leurs **chemins d'import** (et les chemins de fichiers lus par quelques tests). Aucune assertion n'est supprimée, affaiblie ou transformée en `skip`.
- Toute suite verte à chaque commit : `npx tsc --noEmit`, `npm run lint` (0 erreur), `npx vitest run` (456 tests au départ, plus les nouveaux).
- Règles de dépendance R1 à R6 de la spec, vérifiées par `tests/architecture/regles-de-dependance.test.ts` (progressives : appliquées aux modules déjà migrés ; voir R0 tâche 3).
- Client : **SRH**. Interface et libellés en français.
- Sécurité opérationnelle : ne jamais lire ni afficher `.env.local` ; ne jamais lancer `npm run build`, `npm run seed`, `scripts/seed-admin.ts` ni `scripts/send-test-mail.ts` ; aucun e-mail réel. La vérification de compilation Next se fait **uniquement** avec la commande `verifier-build` ci-dessous (variables factices ; les variables du processus l'emportent sur `.env.local`).
- Ne jamais stager `.agents/`, `.claude/`, `skills-lock.json`, `rapports/`, `data/`, `.superpowers/`.
- Branche : une branche par jalon (`refactor/r0-…`), fusion locale dans `main` après revue ; aucun push sans accord.

### Commande `verifier-build` (compilation Next sans toucher la base réelle)

```bash
MONGODB_URI="mongodb://127.0.0.1:9/inexistant" NEXTAUTH_SECRET="verification-build" \
NEXTAUTH_URL="http://localhost:3000" NEXT_TELEMETRY_DISABLED=1 npx next build
```

À lancer à la fin de chaque jalon qui touche des fichiers `route.ts`, `page.tsx` ou la configuration (elle vérifie notamment que les ré-exports de gestionnaires sont acceptés par Next). Elle ne lance pas le script de seed.

## Jalons

| Jalon | Contenu | Dépend de | Statut du plan |
|---|---|---|---|
| **R0** | Fondations (`src/`, `shared/`, `platform/` base + identifiants, test d'architecture, ESLint) + **pilote `equipes`** (backend et frontend) | — | **Réalisé** |
| **R1** | `vehicules`, `equipements` (répétition du modèle, ≈ 1 jour chacun) | R0 | **Réalisé** |
| R2 | `clients-sites` (règle de périmètre du compte client, garde de suppression) | R0 | À détailler après R0 |
| R3 | `comptes` (utilisateurs, authentification, invitation, réinitialisation, jetons, limiteur, e-mail) — **sensible**, en 3 sous-plans : 3a `platform` (e-mail, limiteur, exécution différée, horloge, URL) ; 3b cas d'usage et adaptateurs ; 3c NextAuth, `Acteur`, gardes de pages et de routes | R1, R2 | À détailler |
| R4 | `operations` (le plus gros), en sous-plans : 4a domaine (statuts, conflits, visibilité) ; 4b cas d'usage CRUD + planning ; 4c statut/terrain/photos ; 4d rapport PDF | R3 | À détailler |
| R5 | `recurrences` | R4 | À détailler |
| R6 | `import-donnees` | R4, R2 | À détailler |
| R7 | `pilotage` (statistiques) | R4 | À détailler |
| R8 | Frontends restants : `operations`, `terrain` (PWA et outbox), `clients-sites`, `recurrences`, `import-donnees`, `comptes`, `pilotage`, `navigation`, `design-system` (peut s'intercaler après chaque jalon backend correspondant) | R2 à R7 | À détailler |
| R9 | Clôture : réorganisation miroir des tests, règles ESLint définitives, README « Architecture », suppression des dossiers hérités, revue finale complète | tous | À détailler |

Ordre recommandé : R0 → R1 → R2 → R3 → R4 → (R5, R6, R7) → R8 → R9. Après chaque jalon, l'application est cohérente et déployable : on peut s'arrêter à n'importe quel point.

## Recette d'un domaine (à reproduire à chaque jalon, dans cet ordre)

1. **Filet.** Lister les routes du domaine et les tests qui les couvrent (`grep -rn "<domaine>" tests`). Pour chaque branche non couverte (codes 400/403/404/409, cloisonnements, effets d'écriture), écrire d'abord un **test de caractérisation** qui passe sur le code actuel. Commit séparé.
2. **Règles pures** dans `domain/` avec tests unitaires (aucune dépendance externe).
3. **Ports** dans `domain/ports.ts` ; **faux en mémoire** dans `infrastructure/en-memoire/` ; **cas d'usage** dans `application/`, en TDD, en recopiant fidèlement la logique des routes actuelles (mêmes règles, mêmes erreurs métier).
4. **Adaptateurs Mongoose** (`infrastructure/mongoose/`) : le modèle est **déplacé sans modification de schéma** ; un dépôt convertit document → entité ; test de contrat sur MongoDB en mémoire.
5. **Contrôleurs** dans `http/` (analyse de la requête, validation Zod, appel du cas d'usage, traduction des erreurs métier en codes HTTP, présentation JSON **identique** à l'existant) ; les fichiers `src/app/api/**/route.ts` ne font plus que ré-exporter.
6. **Codemod des imports** : `scripts/dev/remplacer-imports.mjs` (chemins) et `scripts/dev/redistribuer-imports.mjs` (symboles d'un module éclaté), créés en R0 tâche 1 ; puis `tsc` pour prouver qu'il ne reste aucun import cassé.
7. **Frontend** de la fonctionnalité : déplacer les composants dans `src/frontend/<fonctionnalité>/`, extraire le client d'API typé et les hooks, **sans changement visuel** ; la page `src/app/…/page.tsx` garde sa garde d'accès et compose la page de la fonctionnalité.
8. **Ajouter le domaine** aux listes `DOMAINES_BACKEND_MIGRES` / `FONCTIONNALITES_FRONTEND_MIGREES` du test d'architecture ; il doit rester vert.
9. **Supprimer l'ancien code** (dossiers et fichiers vides) ; `verifier-build` ; revue du jalon (sous-agent, modèle le plus capable pour `comptes` et `operations`).

### Conventions

- Entités : types simples (`interface`), champs en français comme le schéma existant ; identifiant exposé `id` (chaîne) ; le numéro de révision Mongoose (`__v`) est conservé sous le nom `revision` **uniquement** pour reproduire la réponse JSON à l'identique.
- Erreurs métier : classes d'erreur du domaine (`EquipeIntrouvable`, `EquipeRattachee`…), traduites en HTTP par le contrôleur avec exactement les codes et messages actuels.
- Cas d'usage : une fabrique `creerCasDUsage<Domaine>(dependances)` renvoie un objet de fonctions asynchrones ; assemblage dans `composition.ts`.
- Tests neufs : **collés au code** (`*.test.ts` à côté du fichier testé) ; les tests d'intégration existants restent dans `tests/integration` jusqu'à la clôture (R9).
- Messages de commit : `refactor(<domaine>): …`, jamais de changement de comportement dans un commit `refactor`.

## Enseignements de R0

- `next build` était **déjà cassé sur `main`** avant le refactoring (export du middleware non reconnu par Next 16) ; corrigé dans son propre commit (`fix(middleware): export par défaut explicite pour Next 16`), avant tout déplacement de fichier.
- Les règles du vérificateur d'architecture ont été durcies en cours de jalon (imports de dossier, `shared` isolé, `platform` sans domaines, `index.ts` restreint, structure inconnue signalée, héritage toléré uniquement dans `http/`, `infrastructure/` et `composition.ts`, tolérance retirée à R9).
- Codemod : après un passage de `remplacer-imports.mjs`, relire le diff et **annuler les modifications collatérales** (fixtures de test, commentaires et chaînes qui contenaient un ancien chemin).
- `git add` avec des pathspecs d'exclusion pour des dossiers ignorés par Git (`.agents/`, `.claude/`, `rapports/`…) retourne un code non nul mais **indexe correctement** les autres fichiers : vérifier avec `git status` plutôt que se fier au code de retour.
- `MongoMemoryServer` démarre **une fois par fichier de test** (y compris les tests collés au code, comme `equipe.repository.mongoose.test.ts`) ; un échec intermittent de démarrage se règle par une relance.

## Enseignements de R1

- Le modèle du pilote se reproduit sans écart (deux domaines migrés en un jalon) ; le vérificateur interdit désormais `mongodb`/`bson` dans le métier et le frontend n'importe plus `src/app`.
- La sonde de parité (anciennes et nouvelles routes comparées sur corps bruts, via `git archive`), rejouée par le relecteur de chaque tâche, n'a trouvé que les deux écarts acceptés : le corps du `POST` 201 liste `_id` en premier (mêmes clés et valeurs) ; les documents écrits hors Mongoose sont présentés à travers l'entité (champs inconnus retirés, `type` absent → `""`, `capacite` absent → `0`, `membres` par défaut pour les équipes).
- Un commit de tests de caractérisation doit passer `tsc` **seul** : celui de `vehicules` ne le faisait pas (typage d'une union issue de `.lean()`), corrigé dans le commit de migration.

## Critères de sortie du chantier

Ceux de la spec (section 11). Le rapport d'avancement et le README sont mis à jour à R9.
