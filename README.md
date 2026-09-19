# SRH Ops — Module 1 Planification des Collectes

Plateforme back-office de planification et suivi des opérations de collecte SRH.

## Stack

- Next.js 15 (App Router) + TypeScript
- MongoDB Atlas + Mongoose
- NextAuth.js (credentials + rôles)
- Tailwind CSS v4 (design system Industrial Integrity)
- FullCalendar (planning)

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
```

## Comptes seed

| Email | Mot de passe | Rôle |
|-------|--------------|------|
| admin@srh.com | admin123 | admin |
| dispatcher@srh.com | dispatch123 | dispatcher |

## Déploiement sur Vercel

1. Pousser le repo sur GitHub, puis importer le projet dans [Vercel](https://vercel.com/new) (framework détecté automatiquement : Next.js).
2. Dans **Project Settings → Environment Variables**, définir pour les environnements Production/Preview :

   | Variable | Valeur |
   |----------|--------|
   | `MONGODB_URI` | URI de connexion MongoDB Atlas |
   | `NEXTAUTH_SECRET` | secret généré via `openssl rand -base64 32` (différent du secret de dev) |
   | `NEXTAUTH_URL` | URL publique du déploiement, ex. `https://<projet>.vercel.app` (ne pas laisser `http://localhost:3000`) |

3. Dans MongoDB Atlas → **Network Access**, autoriser `0.0.0.0/0` (Vercel n'a pas d'IP sortante fixe sur le plan standard), ou utiliser une IP fixe via [Vercel Secure Compute](https://vercel.com/docs/secure-compute) si nécessaire.
4. Déployer. Le build Vercel n'alimente plus la base par défaut : le seed au build n'a lieu que si `SEED_ON_BUILD=true` (à définir temporairement pour le premier déploiement SRH, puis à retirer). `npm run seed` lancé à la main seed toujours ; il ignore l'étape si les deux comptes de base existent déjà.
5. Le seed utilise `MONGODB_URI` fourni par Vercel. Pour l'exécuter manuellement, définir cette variable dans l'environnement avant de lancer `npm run seed`, plutôt que de committer des identifiants.

## Phase 2 — PWA terrain (installable + hors-ligne)

La plateforme est une **PWA installable** : ajout à l'écran d'accueil, service worker
et rejeu des données saisies hors-ligne (outbox FIFO).

### Installer sur mobile / desktop

1. **Déployer sur HTTPS** (Vercel ou localhost via HTTP — le prompt d'installation
   n'apparaît pas en HTTP sans navigateur Chrome/Brave/Edge visible).
2. Ouvrir l'app dans **Chrome** (Android) ou **Edge/Chrome** (desktop) :
   - Android : menu ⋮ → « Ajouter à l'écran d'accueil » / bannière d'installation.
   - Desktop : icône d'installation dans la barre d'adresse (＋ voir infobulle).
3. L'app se lance en plein écran (`display: standalone`) et affiche l'icône SRH.

### Mode hors-ligne

Le service worker (`public/sw.js`) met en cache les assets ; toute la navigation
(planning, opérations du jour, listes) reste consultable sans réseau.

### Saisie hors-ligne (outbox)

Les actions (changement de statut, ajout de photos) sont **mises en file** dans
IndexedDB (`lib/offline/outbox.ts`) puis **rejouées en FIFO** lors du retour de la
connexion via `replayOutbox()`. Les mutations échouées restent en file et sont
rejouées au prochain passage.

## Documentation

- [PLAN.md](./PLAN.md) — plan d'exécution
- [AGENTS.md](./AGENTS.md) — spec technique
- [DESIGN.md](./DESIGN.md) — design system
