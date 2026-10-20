import { TENANT_ROLES, type UserRole } from "@/shared/acces/roles";

export interface GuideTopic {
  title: string;
  steps: string[];
  note?: string;
  href?: string;
  linkLabel?: string;
}

export interface GuideSection {
  id: string;
  role: UserRole;
  roleLabel: string;
  title: string;
  description: string;
  topics: GuideTopic[];
}

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "lecture",
    role: "lecture",
    roleLabel: "Lecture seule",
    title: "Consulter les opérations",
    description: "Ces fonctions servent à suivre l'activité sans modifier les données.",
    topics: [
      {
        title: "Rechercher une intervention",
        steps: [
          "Ouvrez « Interventions » dans le menu.",
          "Choisissez un statut ou une date de début et de fin pour réduire la liste.",
          "Sélectionnez « Détails » pour voir le client, le site, l'équipe, le véhicule et l'historique.",
        ],
        note: "Les filtres peuvent être utilisés ensemble. « Réinitialiser » efface les filtres actifs.",
        href: "/operations",
        linkLabel: "Ouvrir les interventions",
      },
      {
        title: "Voir le planning",
        steps: [
          "Ouvrez « Planning ».",
          "Choisissez la vue jour, semaine ou mois selon la période à examiner.",
          "Sélectionnez une opération pour consulter ses détails.",
        ],
        href: "/operations/planning",
        linkLabel: "Ouvrir le planning",
      },
      {
        title: "Consulter la traçabilité",
        steps: [
          "Ouvrez « Traçabilité des déchets ».",
          "Recherchez un identifiant de suivi, un type de déchet, un client ou un site.",
          "Consultez la quantité, le traitement et l'opération liés à chaque résultat.",
        ],
        href: "/tracabilite",
        linkLabel: "Ouvrir la traçabilité",
      },
    ],
  },
  {
    id: "dispatcher",
    role: "dispatcher",
    roleLabel: "Dispatcher",
    title: "Organiser les collectes",
    description: "Vous avez les droits de lecture seule, avec en plus la gestion des opérations, des demandes et des référentiels.",
    topics: [
      {
        title: "Créer et planifier une opération",
        steps: [
          "Ouvrez « Interventions », puis « Nouvelle opération ».",
          "Choisissez le client et son site, puis indiquez la nature et la date prévue.",
          "Affectez une équipe, un véhicule et, si nécessaire, des équipements.",
          "Relisez les informations puis enregistrez l'opération.",
        ],
        note: "Une opération doit avoir un client, un site et une date. Le système signale les conflits d'affectation.",
        href: "/operations/nouveau",
        linkLabel: "Créer une opération",
      },
      {
        title: "Traiter une demande client",
        steps: [
          "Ouvrez « Demandes clients » et choisissez une demande à traiter.",
          "Pour l'accepter, associez-la au client et au site déjà enregistrés dans la solution.",
          "Validez la conversion : une opération est créée et pourra ensuite être planifiée.",
          "Pour refuser la demande, indiquez le motif avant de confirmer.",
        ],
        note: "La conversion crée une opération au statut « Demande » ; elle ne confirme pas à elle seule une date de collecte.",
        href: "/demandes",
        linkLabel: "Ouvrir les demandes",
      },
      {
        title: "Mettre à jour le statut",
        steps: [
          "Ouvrez l'opération depuis la liste, le planning ou la console terrain.",
          "Choisissez l'un des statuts proposés pour cette opération.",
          "Complétez les informations demandées, puis confirmez la mise à jour.",
        ],
        note: "Chaque changement est ajouté à l'historique avec sa date et son auteur. Les statuts proposés suivent les règles de transition.",
        href: "/operations",
        linkLabel: "Consulter les opérations",
      },
      {
        title: "Tenir à jour les référentiels",
        steps: [
          "Ouvrez la rubrique correspondante : « Clients & Sites », « Équipes », « Véhicules » ou « Équipements ».",
          "Utilisez l'action de création ou sélectionnez une ligne pour la modifier.",
          "Vérifiez les informations avant d'enregistrer.",
        ],
        note: "Des référentiels exacts facilitent l'affectation des opérations et le traitement des demandes.",
      },
      {
        title: "Importer un fichier Excel",
        steps: [
          "Ouvrez « Import Excel » et sélectionnez votre fichier.",
          "Lancez l'analyse et vérifiez les données détectées avant de les importer.",
          "Corrigez les informations signalées dans le fichier, puis recommencez l'analyse si nécessaire.",
        ],
        note: "Un import ajoute des données à la solution. Vérifiez soigneusement le résultat avant de confirmer.",
        href: "/import",
        linkLabel: "Ouvrir l'import Excel",
      },
    ],
  },
  {
    id: "admin",
    role: "admin",
    roleLabel: "Admin Ops",
    title: "Administrer les accès",
    description: "Vous disposez aussi des droits Dispatcher et Lecture seule. Ce chapitre ajoute la gestion des comptes et des rôles.",
    topics: [
      {
        title: "Créer un compte et choisir son rôle",
        steps: [
          "Ouvrez « Utilisateurs & Rôles ».",
          "Créez un utilisateur avec son nom et son adresse e-mail.",
          "Attribuez le rôle adapté à sa mission et associez-le, si demandé, à son client ou à son équipe.",
          "Enregistrez le compte et transmettez les informations de connexion par un canal sûr.",
        ],
        note: "Choisissez le rôle le moins élevé qui permet à la personne de faire son travail.",
        href: "/utilisateurs",
        linkLabel: "Gérer les utilisateurs",
      },
      {
        title: "Aider un utilisateur à retrouver l'accès",
        steps: [
          "Retrouvez son compte dans « Utilisateurs & Rôles ».",
          "Utilisez l'action de réinitialisation ou d'envoi de lien disponible sur sa fiche.",
          "Demandez à la personne de définir un nouveau mot de passe à partir du lien reçu.",
        ],
        note: "Ne demandez jamais à un utilisateur de vous communiquer son mot de passe.",
        href: "/utilisateurs",
        linkLabel: "Ouvrir les utilisateurs",
      },
      {
        title: "Consulter les guides des autres rôles",
        steps: [
          "Les chapitres « Lecture seule », « Dispatcher », « Chauffeur / Terrain » et « Espace client » sont affichés plus bas.",
          "Vous pouvez les consulter pour expliquer le parcours d'un utilisateur ou l'aider à résoudre une difficulté.",
        ],
      },
    ],
  },
  {
    id: "superadmin",
    role: "superadmin",
    roleLabel: "Super administrateur plateforme",
    title: "Configurer l'entreprise et son premier accès",
    description: "Ce chapitre explique comment créer le premier compte Admin Ops et configurer l'identité de l'entreprise cliente.",
    topics: [
      {
        title: "Créer le premier compte Admin Ops",
        steps: [
          "Ouvrez « Identité de l'entreprise » dans le menu de la plateforme.",
          "Dans « Premier compte Admin Ops », saisissez l'identifiant, le nom et l'adresse e-mail du responsable de l'entreprise.",
          "Créez le compte. Si l'invitation par e-mail échoue, transmettez son mot de passe temporaire par un canal sûr.",
          "Demandez à l'Admin Ops de se connecter et de choisir son mot de passe. Il pourra ensuite créer les autres comptes depuis « Utilisateurs & Rôles ».",
        ],
        note: "Ce compte initial ne peut être créé qu'une seule fois. Le rôle admin est attribué automatiquement.",
        href: "/plateforme/entreprise",
        linkLabel: "Créer le premier Admin Ops",
      },
      {
        title: "Modifier les informations de l'entreprise",
        steps: [
          "Ouvrez « Identité de l'entreprise » dans le menu de la plateforme.",
          "Saisissez le nom, le sigle et, si besoin, le site web de l'entreprise.",
          "Ajoutez un logo PNG ou JPEG si l'entreprise souhaite l'afficher sur ses rapports.",
          "Enregistrez les paramètres et vérifiez l'aperçu.",
        ],
        note: "Ce réglage est réservé au super administrateur plateforme. Le logo WOM de l'application et son favicon ne changent pas.",
        href: "/plateforme/entreprise",
        linkLabel: "Ouvrir l'identité de l'entreprise",
      },
    ],
  },
  {
    id: "chauffeur",
    role: "chauffeur",
    roleLabel: "Chauffeur / Terrain",
    title: "Utiliser la console terrain",
    description: "La console permet de consulter les opérations affectées et de saisir les informations de terrain.",
    topics: [
      {
        title: "Ouvrir une opération",
        steps: [
          "Ouvrez « Console Web Terrain » avec une connexion Internet.",
          "Choisissez l'opération à réaliser pour consulter le site, l'équipe, le véhicule et les consignes.",
          "Vérifiez les informations avant de commencer la collecte.",
        ],
        note: "La solution fonctionne en ligne : les changements ne sont pas enregistrés sans connexion Internet.",
        href: "/terrain",
        linkLabel: "Ouvrir la console terrain",
      },
      {
        title: "Suivre l'avancement et saisir le résultat",
        steps: [
          "Dans l'opération, choisissez le prochain statut proposé.",
          "Saisissez la quantité collectée et son unité, puis ajoutez une remarque si besoin.",
          "Renseignez le nom du signataire et recueillez sa signature lorsque cela est demandé.",
          "Enregistrez les changements avant de quitter l'opération.",
        ],
      },
      {
        title: "Ajouter des photos et des données de traçabilité",
        steps: [
          "Ajoutez des photos depuis le détail de l'opération si elles sont nécessaires.",
          "Ouvrez la partie « Traçabilité » de l'opération.",
          "Saisissez l'identifiant de suivi, le type de déchet, la quantité et le traitement.",
          "Vérifiez les valeurs puis enregistrez.",
        ],
      },
    ],
  },
  {
    id: "client",
    role: "client",
    roleLabel: "Espace Client",
    title: "Suivre vos collectes",
    description: "Votre espace présente les demandes et les opérations rattachées à votre entreprise.",
    topics: [
      {
        title: "Consulter vos opérations",
        steps: [
          "Ouvrez « Espace client » pour voir le résumé et l'activité récente.",
          "Sélectionnez « Toutes les opérations » pour consulter la liste complète.",
          "Vérifiez le statut et la date prévue de chaque collecte.",
        ],
        note: "Vous ne voyez que les informations rattachées à votre entreprise.",
        href: "/espace-client",
        linkLabel: "Ouvrir votre espace client",
      },
      {
        title: "Envoyer une demande de collecte",
        steps: [
          "Dans votre espace, sélectionnez « Demander une collecte ».",
          "Indiquez les informations de contact, le site, la nature de l'intervention et la date souhaitée.",
          "Vérifiez les informations puis envoyez la demande.",
          "Consultez ensuite son évolution dans votre espace.",
        ],
        note: "L'envoi d'une demande ne vaut pas confirmation de la collecte. L'équipe de votre entreprise doit d'abord la vérifier et la traiter.",
        href: "/espace-client/nouvelle-demande",
        linkLabel: "Faire une demande",
      },
    ],
  },
];

const ROLES_INTERNES: Record<UserRole, UserRole[]> = {
  admin: ["lecture", "dispatcher", "admin", "chauffeur", "client"],
  dispatcher: ["lecture", "dispatcher"],
  lecture: ["lecture"],
  chauffeur: ["chauffeur"],
  client: ["client"],
  superadmin: [...TENANT_ROLES, "superadmin"],
};

export function guideSectionsForRole(role: UserRole): GuideSection[] {
  const visibleRoles = ROLES_INTERNES[role];
  return GUIDE_SECTIONS.filter((section) => visibleRoles.includes(section.role));
}
