# PLAN DE DÉVELOPPEMENT
## Module 1 — Planification des Collectes
### Projet SRH — Digitalisation des Opérations
**Stack technique :** Next.js (Full-stack) + MongoDB

---

## 1. OBJECTIF DU MODULE

Développer un système permettant de créer, planifier, affecter et suivre les opérations de collecte de SRH, en remplaçant la gestion manuelle actuelle par une plateforme centralisée.

Le module doit permettre :
- La création et planification d'interventions (client, site, équipe, véhicule, équipements, date/heure).
- Le suivi de leur statut du début à la fin.
- Une vision globale et filtrable de l'ensemble des opérations pour la direction.

Ce module constitue la **Phase 1** du projet global et sert de fondation aux modules suivants (application mobile, traçabilité, tableau de bord, etc.).

---

## 2. PÉRIMÈTRE FONCTIONNEL (SCOPE)

### 2.1 Fonctionnalités incluses
1. Gestion des **clients** et **sites** (CRUD basique).
2. Gestion des **équipes** (CRUD basique).
3. Gestion des **véhicules** (CRUD basique).
4. Gestion des **équipements** (CRUD basique).
5. Création et planification d'une **opération/intervention**.
6. Suivi du **statut** de chaque opération : `Planifiée → Affectée → En route → En cours → Terminée → Rapportée` (+ `Retardée`, `Annulée`).
7. Vue **calendrier / planning** des interventions (par jour, semaine, mois).
8. Vue **liste** filtrable (par client, statut, équipe, véhicule, date).
9. Tableau de bord simple : compteurs (prévues, en cours, terminées, retardées).
10. Authentification et gestion des rôles (Admin / Dispatcher / Lecture seule).

### 2.2 Hors périmètre (modules suivants)
- Application mobile terrain (Phase 2).
- Rapport digital d'intervention détaillé avec photos/signature (Phase 2).
- Traçabilité des déchets (Phase 3).
- Espace client / demandes en ligne (Phase 4).
- Notifications automatisées (Phase 5).
- Optimisation des tournées (Phase 6).

---

## 3. ARCHITECTURE TECHNIQUE

### 3.1 Stack proposée

| Couche | Technologie |
|---|---|
| Framework | Next.js 14+ (App Router) |
| Langage | TypeScript |
| Base de données | MongoDB (Atlas ou self-hosted) |
| ODM | Mongoose |
| Authentification | NextAuth.js (credentials + rôles) |
| UI | Tailwind CSS + shadcn/ui |
| Calendrier | FullCalendar ou react-big-calendar |
| Formulaires | React Hook Form + Zod (validation) |
| État global (client) | React Query (TanStack Query) |
| Déploiement | Vercel (app) + MongoDB Atlas (DB) |
| Gestion de version | Git / GitHub |

### 3.2 Architecture applicative

```
Client (navigateur)
   ↓
Next.js App Router
   ├── Pages (Server Components) → rendu des vues
   ├── API Routes (Route Handlers) → logique métier / accès DB
   └── Middlewares → authentification, rôles
   ↓
Mongoose (ODM)
   ↓
MongoDB (Atlas)
```

### 3.3 Structure du projet

```
srh-planification/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx                 # Tableau de bord
│   │   ├── clients/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── sites/
│   │   ├── equipes/
│   │   ├── vehicules/
│   │   ├── equipements/
│   │   └── operations/
│   │       ├── page.tsx             # Liste + filtres
│   │       ├── planning/page.tsx    # Vue calendrier
│   │       ├── nouveau/page.tsx     # Création
│   │       └── [id]/page.tsx        # Détail / édition / statut
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── clients/route.ts
│   │   ├── clients/[id]/route.ts
│   │   ├── sites/...
│   │   ├── equipes/...
│   │   ├── vehicules/...
│   │   ├── equipements/...
│   │   └── operations/
│   │       ├── route.ts
│   │       ├── [id]/route.ts
│   │       └── [id]/statut/route.ts
│   └── layout.tsx
├── components/
│   ├── ui/                          # composants shadcn
│   ├── forms/
│   ├── calendar/
│   └── tables/
├── lib/
│   ├── db.ts                        # connexion Mongoose
│   ├── auth.ts                      # config NextAuth
│   └── validators/                  # schémas Zod
├── models/
│   ├── Client.ts
│   ├── Site.ts
│   ├── Equipe.ts
│   ├── Vehicule.ts
│   ├── Equipement.ts
│   ├── Operation.ts
│   └── User.ts
├── types/
├── .env.local
└── package.json
```

---

## 4. MODÉLISATION DES DONNÉES (MongoDB / Mongoose)

### 4.1 Collection `clients`
```ts
{
  _id: ObjectId,
  nom: string,
  contact: { telephone: string, email: string },
  createdAt: Date,
  updatedAt: Date
}
```

### 4.2 Collection `sites`
```ts
{
  _id: ObjectId,
  clientId: ObjectId,        // ref Client
  nom: string,
  adresse: string,
  localisation: { lat: number, lng: number },  // optionnel, prépare Phase 6
  typeDechets: [string],
  observations: string
}
```

### 4.3 Collection `equipes`
```ts
{
  _id: ObjectId,
  nom: string,
  membres: [string],
  disponibilite: boolean
}
```

### 4.4 Collection `vehicules`
```ts
{
  _id: ObjectId,
  identification: string,     // immatriculation
  type: string,
  capacite: number,
  disponibilite: boolean
}
```

### 4.5 Collection `equipements`
```ts
{
  _id: ObjectId,
  nom: string,
  type: string,
  disponibilite: boolean
}
```

### 4.6 Collection `operations` (cœur du module)
```ts
{
  _id: ObjectId,
  clientId: ObjectId,          // ref Client
  siteId: ObjectId,            // ref Site
  natureIntervention: string,
  dateHeurePrevue: Date,
  equipeId: ObjectId,          // ref Equipe
  vehiculeId: ObjectId,        // ref Vehicule
  equipementIds: [ObjectId],   // ref Equipements
  informationsParticulieres: string,
  statut: {
    type: string,
    enum: [
      "Planifiée", "Affectée", "En route",
      "En cours", "Terminée", "Rapportée",
      "Retardée", "Annulée"
    ],
    default: "Planifiée"
  },
  historiqueStatuts: [
    { statut: string, date: Date, parUtilisateur: ObjectId }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

### 4.7 Collection `users`
```ts
{
  _id: ObjectId,
  nom: string,
  email: string,
  motDePasseHash: string,
  role: { type: string, enum: ["admin", "dispatcher", "lecture"] }
}
```

### 4.8 Index recommandés
- `operations.dateHeurePrevue` (recherche par plage de dates / vue calendrier).
- `operations.statut`.
- `operations.clientId`, `operations.equipeId`, `operations.vehiculeId`.
- `sites.clientId`.

---

## 5. API — ENDPOINTS PRINCIPAUX

| Méthode | Endpoint | Description |
|---|---|---|
| GET/POST | `/api/clients` | Lister / créer un client |
| GET/PUT/DELETE | `/api/clients/[id]` | Détail / modifier / supprimer |
| GET/POST | `/api/sites` | Lister / créer un site |
| GET/POST | `/api/equipes` | Lister / créer une équipe |
| GET/POST | `/api/vehicules` | Lister / créer un véhicule |
| GET/POST | `/api/equipements` | Lister / créer un équipement |
| GET/POST | `/api/operations` | Lister (avec filtres query params) / créer une opération |
| GET/PUT/DELETE | `/api/operations/[id]` | Détail / modifier / supprimer |
| PATCH | `/api/operations/[id]/statut` | Changer le statut (avec historisation) |
| GET | `/api/operations/planning` | Données formatées pour la vue calendrier |
| GET | `/api/dashboard/stats` | Compteurs pour le tableau de bord |

**Filtres attendus sur `GET /api/operations` :** `clientId`, `siteId`, `equipeId`, `vehiculeId`, `statut`, `dateDebut`, `dateFin`.

---

## 6. RÈGLES MÉTIER CLÉS

1. Une opération ne peut être créée sans **client + site + date prévue**.
2. Un véhicule ou une équipe **ne peut pas être affecté(e)** à deux opérations qui se chevauchent dans le temps (vérification de conflit).
3. Le changement de statut doit être **historisé** (qui, quand, ancien → nouveau statut).
4. Une opération passée en `Terminée` sans avoir été marquée `En cours` déclenche une alerte de cohérence (log, pas bloquant en V1).
5. Une opération dont `dateHeurePrevue` est dépassée et dont le statut n'est pas `Terminée`/`Annulée` passe automatiquement en `Retardée` (job planifié ou calcul à l'affichage).
6. Seuls les rôles `admin` et `dispatcher` peuvent créer/modifier ; le rôle `lecture` a un accès en consultation uniquement.

---

## 7. PLAN DE DÉVELOPPEMENT — SPRINTS

### Sprint 0 — Cadrage & Setup (1 semaine)
- Atelier de cadrage avec SRH (confirmer champs, statuts, rôles).
- Setup du repo Next.js + TypeScript + Tailwind.
- Setup MongoDB Atlas (cluster, base, utilisateur, IP whitelisting).
- Configuration NextAuth (authentification + rôles).
- Mise en place CI/CD basique (Vercel + variables d'environnement).

### Sprint 1 — Référentiels de base (1-2 semaines)
- Modèles Mongoose : Client, Site, Équipe, Véhicule, Équipement, User.
- CRUD complet (API + UI) pour Clients et Sites.
- CRUD complet (API + UI) pour Équipes, Véhicules, Équipements.
- Validation des formulaires (Zod).

### Sprint 2 — Cœur du module : Opérations (2 semaines)
- Modèle Mongoose Operation (avec historique de statuts).
- API de création/lecture/mise à jour/suppression des opérations.
- Formulaire de création d'opération (sélection client → site en cascade, équipe, véhicule, équipements).
- Vérification de conflits d'affectation (véhicule/équipe).
- Vue liste des opérations avec filtres et pagination.

### Sprint 3 — Suivi des statuts & Planning (1-2 semaines)
- API de changement de statut avec historisation.
- Composant de changement de statut (UI) avec règles de transition.
- Vue calendrier/planning (FullCalendar) avec code couleur par statut.
- Vue "aujourd'hui" pour la direction (opérations du jour).

### Sprint 4 — Tableau de bord & finitions (1 semaine)
- Endpoint `/api/dashboard/stats` (compteurs : prévues, en cours, terminées, retardées, annulées).
- Page tableau de bord avec indicateurs synthétiques.
- Gestion des rôles/permissions sur les actions sensibles.
- Responsive / adaptation mobile-web (en attendant l'app mobile Phase 2).

### Sprint 5 — Tests, recette & déploiement (1 semaine)
- Tests fonctionnels avec l'équipe SRH (recette utilisateur).
- Corrections et ajustements suite aux retours.
- Migration/import des données existantes (si disponibles, ex. Excel).
- Formation des utilisateurs (dispatcher, direction).
- Déploiement en production (Vercel + MongoDB Atlas).

**Durée totale estimée : 7 à 9 semaines** (selon disponibilité des interlocuteurs SRH et complexité des règles de conflit).

---

## 8. LIVRABLES

- Code source (repository Git).
- Base de données MongoDB structurée et documentée (schémas).
- Documentation technique (installation, variables d'environnement, déploiement).
- Guide utilisateur (création d'une opération, suivi des statuts, planning).
- Environnement de production fonctionnel (URL de l'application).

---

## 9. PRÉREQUIS CÔTÉ SRH

- Liste réelle des clients, sites, équipes, véhicules et équipements existants (pour l'import initial).
- Confirmation des statuts et de leurs règles de transition exactes.
- Désignation d'un référent SRH pour les ateliers de cadrage et la recette.
- Accès aux éventuelles données existantes (fichiers Excel, plannings papier) à migrer.

---

## 10. ÉVOLUTIVITÉ VERS LES MODULES SUIVANTS

Le modèle de données et l'architecture sont conçus pour permettre l'ajout progressif de :
- **Phase 2** : champ `rapportId`, `photos`, `signatureClient` sur `Operation` + endpoint mobile.
- **Phase 3** : collection `traçabilite` liée à `Operation` (identifiant de suivi, volumes, traitement).
- **Phase 4** : espace client (lecture seule sur `Operation` filtrée par `clientId`) + formulaire de demande en ligne créant une `Operation` en statut `Demande`.
- **Phase 5** : enrichissement du tableau de bord (graphiques, exports).
- **Phase 6** : intégration d'un moteur d'optimisation de tournées basé sur `localisation` des sites.