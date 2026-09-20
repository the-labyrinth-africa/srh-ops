# SRH Ops — Module 1 Planification des Collectes

Plateforme back-office de planification et suivi des opérations de collecte SRH.

## Stack

- Next.js 16 (App Router) + TypeScript
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

## Phase 2 — Console terrain (PWA) — livraison partielle, PWA désactivée

La console terrain est accessible sur **`/terrain`** (rôle Chauffeur) et fonctionne
comme une page web normale. Elle est prévue pour être installée comme PWA et pour
fonctionner avec une connexion instable, mais **la PWA est désactivée par défaut**
tant que les défauts de l'outbox et du service worker ne sont pas corrigés : voir
« Limites connues » ci-dessous.

### Activer / désactiver la PWA

Le service worker n'est enregistré que si `NEXT_PUBLIC_ENABLE_PWA="true"`
(cf. `.env.local.example`). Par défaut la variable est absente : l'application
désinstalle alors tout service worker déjà enregistré et vide les caches
`srh-ops-*` des postes qui ont visité une version précédente.

### Installer depuis le navigateur (une fois la PWA réactivée)

1. Ouvrir l'application en HTTPS (déploiement Vercel) dans Chrome/Edge (Android ou desktop).
2. Android : menu ⋮ → « Ajouter à l'écran d'accueil » ; desktop : icône d'installation
   dans la barre d'adresse. L'app se lance alors en plein écran (`display: standalone`).
3. Le manifest est servi par `app/manifest.ts`, le service worker par `public/sw.js`.

### Comportement hors-ligne (outbox)

Les actions saisies sur `/terrain` (changement de statut, photos) sont mises en file dans
IndexedDB (`lib/offline/outbox.ts`) puis rejouées dans l'ordre (FIFO) au retour du réseau
(`hooks/useOfflineSync.ts`). Une action qui échoue reste en file et est retentée au
passage suivant.

### Limites connues (la PWA reste désactivée tant qu'elles ne sont pas traitées)

L'installabilité et le mode hors-ligne n'ont pas été validés de bout en bout. Le
service worker n'est donc pas enregistré par défaut (`NEXT_PUBLIC_ENABLE_PWA`).
Défauts identifiés et non encore corrigés :

- **Outbox** : les photos sont envoyées sous la forme `{ photos }` alors que l'API attend
  `{ photo }` (réponse 400) ; un `fetch` est exécuté à l'intérieur d'une transaction
  IndexedDB (la transaction peut se fermer avant la fin de la requête).
- **Service worker** : les pages authentifiées peuvent être mises en cache sous `/`, les
  requêtes RSC sont servies en cache-first (contenu périmé), et le précache échoue sur
  une redirection.
- **Stockage** : photos et signature sont conservées en base64 dans le document
  `Operation` (limite Mongo de 16 Mo par document). Les photos sont désormais
  réduites côté navigateur et plafonnées à 2 Mo l'unité / 8 Mo par opération, mais
  un stockage objet reste à mettre en place.
- **Rapport** : l'envoi du rapport d'intervention par e-mail au client n'existe pas
  encore ; le PDF est régénéré à la demande et n'est plus stocké dans l'opération.
- **Mot de passe oublié** : la réinitialisation en libre-service est désactivée
  (503) en attendant un vrai flux à jeton. Contactez un administrateur SRH : il peut
  régénérer votre mot de passe depuis « Utilisateurs & Rôles » (bouton « Régénérer
  le mot de passe »), et le nouveau mot de passe temporaire lui est affiché une seule
  fois pour vous le communiquer.

La PWA reste désactivée pour les utilisateurs terrain tant que ces points ne sont
pas traités (Lot « Phase 2 — finition » du plan d'alignement).

## Documentation

- [PLAN.md](./PLAN.md) — plan d'exécution
- [docs/superpowers/plans/2026-09-19-alignement-proposition-digitalisation.md](./docs/superpowers/plans/2026-09-19-alignement-proposition-digitalisation.md) — alignement avec la proposition (docs/proposition-digitalisation.pdf)
- [AGENTS.md](./AGENTS.md) — spec technique
- [DESIGN.md](./DESIGN.md) — design system
