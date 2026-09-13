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
4. Déployer. Le build Vercel exécute automatiquement `npm run seed`, puis `next build`. Le seed crée les comptes et les données de démonstration lors du premier déploiement uniquement ; les déploiements suivants l'ignorent si les deux comptes de base existent déjà.
5. Le seed utilise `MONGODB_URI` fourni par Vercel. Pour l'exécuter manuellement, définir cette variable dans l'environnement avant de lancer `npm run seed`, plutôt que de committer des identifiants.

## Documentation

- [PLAN.md](./PLAN.md) — plan d'exécution
- [AGENTS.md](./AGENTS.md) — spec technique
- [DESIGN.md](./DESIGN.md) — design system
