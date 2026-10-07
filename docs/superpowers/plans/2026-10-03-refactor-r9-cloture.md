# Refactoring R9 — Clôture de l'architecture : Implementation Plan

> Plan d'exécution du jalon de clôture défini dans `2026-09-20-refactor-architecture-master.md`.

**Goal:** Finaliser l'architecture backend/frontend, supprimer les tolérances temporaires, organiser les tests par domaine et satisfaire les critères de fin de la spec, sans changement fonctionnel.

**Contraintes:** préserver les modifications R8 présentes dans le worktree; ne pas modifier les assertions d'intégration sauf la suppression documentée des tests dupliqués de jetons; ne pas lancer de seed, d'envoi d'e-mail réel ni lire `.env.local`; respecter les écarts déjà documentés dans le README.

## Tasks

### Task 1 : Vérification de l'état de départ
- [x] Confirmer les livrables R8 présents et les dossiers legacy absents.
- [x] Exécuter `npx tsc --noEmit`, `npm run lint` et `npx vitest run` avant les changements R9.
- [x] Relever les suivis R4/R3c explicitement réservés à R9.

### Task 2 : Réorganisation des tests d'intégration
- [x] Ranger les tests d'intégration dans `tests/integration/<domaine>/`, sans modifier leur contenu ni leurs assertions.
- [x] Garder les tests unitaires neufs collés au code et les tests d'architecture dans `tests/architecture/`.
- [x] Réduire `reset-token.test.ts` aux deux vérifications non redondantes (index Mongo/TTL et empreinte SHA-256 exacte), en conservant intégralement leur couverture.

### Task 3 : Règles d'architecture définitives
- [x] Retirer les constantes et branches de tolérance héritée devenues obsolètes (`src/lib/`, `src/components/`, `src/hooks/`, `src/models/`).
- [x] Vérifier le respect strict des frontières R1 à R5, sans exception legacy.
- [x] Inclure `src/app/**` dans le test d'architecture et faire respecter R6: composition via `frontend`, `shared`, index publics de domaines et contrôleurs de routes; exception limitée à la route NextAuth.
- [x] Ajouter des cas positifs/négatifs pour chaque catégorie d'import autorisée par R6.

### Task 4 : Derniers suivis techniques
- [x] Supprimer `isWithinTeamScope`, `chauffeurWithoutTeamError`, `TEAM_SCOPE_ERROR` et la matrice de parité devenue sans consommateur; conserver les outils de périmètre client encore utilisés.
- [x] Retirer les assertions de type évitables dans les schémas et le traitement des photos d'`operations`, sans modifier les réponses ni les validations.
- [x] Revoir le mapping `null`/valeurs par défaut et la relecture après changement de statut; conserver explicitement les écarts de réponse documentés et ne pas introduire de correctif fonctionnel.
- [x] Ne pas traiter dans ce refactoring le plafond de photos manquant ou les courses sous concurrence, sauf si une correction sans changement de comportement est démontrable.

### Task 5 : Documentation et revue finale
- [x] Mettre à jour la section Architecture du README: structure, règles R1–R6, état final et procédure d'ajout d'une fonctionnalité.
- [x] Mettre à jour le plan maître et la spec avec le statut R9 réalisé, les décisions de revue et les éventuelles limites d'environnement.
- [x] Vérifier qu'aucun fichier applicatif ne demeure hors de `src/` et qu'aucun dossier legacy n'existe.
- [x] Exécuter `npx tsc --noEmit`, `npm run lint`, `npx vitest run` et `verifier-build` avec les variables factices prescrites.

## Critères de sortie

- Règles R1 à R6 appliquées par tests; aucune tolérance legacy.
- Tests, TypeScript et ESLint verts; compilation Next vérifiée ou blocage d'environnement consigné.
- Aucun changement de comportement métier, HTTP, JSON ou interface.
- README, plan maître et spec reflètent la clôture réelle.