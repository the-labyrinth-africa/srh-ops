# Refactoring R8 — Frontends restants (`src/frontend/`) : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrer l'intégralité des composants frontend restants, hooks et helpers d'interface depuis les dossiers hérités (`src/components/`, `src/lib/`, `src/hooks/`) vers l'architecture « screaming » `src/frontend/<fonctionnalité>/` et `src/frontend/design-system/`, sans aucun changement visuel ni fonctionnel.

**Architecture Frontend cible:**
- `src/frontend/design-system/` : `StatusBadge.tsx`, `PhotoUpload.tsx`, `SignaturePad.tsx`, `EntityModal.tsx`, `PageReferentiel.tsx`, `status-styles.ts`, `format-api-error.ts`, `cn.ts`
- `src/frontend/navigation/` : `DashboardShell.tsx`, `Header.tsx`, `Sidebar.tsx`, `Providers.tsx`, `nav.ts`
- `src/frontend/operations/` : `OperationsListClient.tsx`, `PlanningCalendarClient.tsx`, `OperationFormClient.tsx`, `OperationDetailClient.tsx`
- `src/frontend/terrain/` : `TerrainViewClient.tsx`, `PwaRegistrar.tsx`, `outbox.ts`, `image-compress.ts`, `useOfflineSync.ts`
- `src/frontend/comptes/` : `UsersListClient.tsx`, `UserFormModal.tsx`, `TemporaryPasswordPanel.tsx`, `ForgotPasswordClient.tsx`, `ResetPasswordClient.tsx`, `ProfilPageClient.tsx`, `password-form.ts`
- `src/frontend/recurrences/` : `RecurrencesListClient.tsx`, `RecurrenceFormModal.tsx`
- `src/frontend/import-donnees/` : `ImportPageClient.tsx`
- `src/frontend/pilotage/` : composants/pages du tableau de bord de pilotage
- `src/shared/validators/object-id.ts` : validation d'ID Mongo partagée

---

## Tasks

### Task 1 : Migration du Design System et des Utilitaires Transverses
- [x] Deplacer `src/components/ui/StatusBadge.tsx` -> `src/frontend/design-system/StatusBadge.tsx`
- [x] Deplacer `src/lib/status-styles.ts` -> `src/frontend/design-system/status-styles.ts` (re-export dans `src/frontend/design-system/index.ts`)
- [x] Deplacer `src/lib/api-error.ts` -> `src/frontend/design-system/format-api-error.ts`
- [x] Deplacer `src/lib/validators/object-id.ts` -> `src/shared/validators/object-id.ts`
- [x] Mettre à jour les imports et valider `npx tsc --noEmit`.

### Task 2 : Migration de `navigation`
- [x] Deplacer `src/components/layout/*` (`DashboardShell.tsx`, `Header.tsx`, `Sidebar.tsx`) et `src/components/providers/Providers.tsx` vers `src/frontend/navigation/composants/`
- [x] Deplacer `src/lib/nav.ts` -> `src/frontend/navigation/nav.ts` (ou re-exporter via `src/frontend/navigation/index.ts`)
- [x] Créer `src/frontend/navigation/index.ts`
- [x] Mettre à jour les imports et valider `npx tsc --noEmit`.

### Task 3 : Migration du Frontend `operations`
- [x] Deplacer `src/components/operations/*` (`OperationsListClient.tsx`, `PlanningCalendarClient.tsx`, `OperationFormClient.tsx`, `OperationDetailClient.tsx`) vers `src/frontend/operations/composants/` et `src/frontend/operations/pages/`
- [x] Exposer l'API via `src/frontend/operations/index.ts`
- [x] Mettre à jour les imports dans `src/app/(dashboard)/operations/**/page.tsx`
- [x] Valider `npx tsc --noEmit`.

### Task 4 : Migration du Frontend `terrain` (PWA & Outbox)
- [x] Deplacer `src/components/terrain/TerrainViewClient.tsx` -> `src/frontend/terrain/composants/TerrainViewClient.tsx`
- [x] Deplacer `src/components/ui/PhotoUpload.tsx` et `src/components/ui/SignaturePad.tsx` -> `src/frontend/design-system/` ou `src/frontend/terrain/composants/`
- [x] Deplacer `src/components/pwa/PwaRegistrar.tsx` -> `src/frontend/terrain/composants/PwaRegistrar.tsx`
- [x] Deplacer `src/lib/offline/outbox.ts` -> `src/frontend/terrain/offline/outbox.ts`
- [x] Deplacer `src/lib/image-compress.ts` -> `src/frontend/terrain/utils/image-compress.ts`
- [x] Deplacer `src/hooks/useOfflineSync.ts` -> `src/frontend/terrain/hooks/useOfflineSync.ts`
- [x] Exposer l'API via `src/frontend/terrain/index.ts`
- [x] Mettre à jour les imports dans `src/app/(dashboard)/terrain/page.tsx` et `src/app/layout.tsx`
- [x] Valider `npx tsc --noEmit`.

### Task 5 : Migration du Frontend `comptes` (Utilisateurs, Auth & Profil)
- [x] Deplacer `src/components/users/*` (`UsersListClient.tsx`, `UserFormModal.tsx`, `TemporaryPasswordPanel.tsx`) -> `src/frontend/comptes/composants/`
- [x] Deplacer `src/components/auth/*` (`ForgotPasswordClient.tsx`, `ResetPasswordClient.tsx`) -> `src/frontend/comptes/composants/`
- [x] Deplacer `src/components/profil/ProfilPageClient.tsx` -> `src/frontend/comptes/composants/ProfilPageClient.tsx`
- [x] Deplacer `src/lib/validators/password-form.ts` -> `src/shared/comptes/validators/password-form.ts`
- [x] Exposer l'API via `src/frontend/comptes/index.ts`
- [x] Mettre à jour les imports dans `src/app/` (`utilisateurs`, `forgot-password`, `reset-password`, `profil`)
- [x] Valider `npx tsc --noEmit`.

### Task 6 : Migration du Frontend `recurrences`, `import-donnees` et `pilotage`
- [x] Deplacer `src/components/recurrences/*` (`RecurrencesListClient.tsx`, `RecurrenceFormModal.tsx`) -> `src/frontend/recurrences/composants/` ; créer `src/frontend/recurrences/index.ts`
- [x] Deplacer `src/components/import/ImportPageClient.tsx` -> `src/frontend/import-donnees/composants/ImportPageClient.tsx` ; créer `src/frontend/import-donnees/index.ts`
- [x] Créer `src/frontend/pilotage/` si nécessaire pour la page de tableau de bord
- [x] Mettre à jour tous les imports dans `src/app/`
- [x] Valider `npx tsc --noEmit`.

### Task 7 : Mise à jour du Test d'Architecture, Nettoyage et Vérification Finale
- [x] Mettre à jour `fonctionnalitesFrontendMigrees` dans `tests/architecture/regles-de-dependance.test.ts`
- [x] Supprimer les dossiers vides `src/components/`, `src/lib/`, `src/hooks/`
- [x] Exécuter `npx tsc --noEmit`, `npm run lint`, `npx vitest run`
- [x] Lancer `verifier-build`
- [x] Mettre à jour `2026-09-20-refactor-architecture-master.md` et `README.md` avec le statut R8 **Réalisé**.

### Clôture

`npx tsc --noEmit`, `npm run lint` (0 erreur, avertissements existants), `npx vitest run` (108 fichiers, 1 393 tests) et le test ciblé d'architecture passent. `verifier-build` a été lancé avec les variables factices prescrites ; Turbopack s'arrête pendant le traitement PostCSS avec `binding to a port: Operation not permitted`, y compris après relance avec autorisation d'exécution. La compilation Next reste donc à revalider dans un environnement qui autorise cette ouverture de port.
