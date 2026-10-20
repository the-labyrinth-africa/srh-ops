import { canAccessPath } from "@/shared/acces/acces-pages";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  match?: (path: string) => boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/", label: "Tableau de bord", icon: "dashboard", match: (p) => p === "/" },
      {
        href: "/guide",
        label: "Guide d'utilisation",
        icon: "menu_book",
        match: (p) => p.startsWith("/guide"),
      },
      {
        href: "/espace-client",
        label: "Espace client",
        icon: "business_center",
        match: (p) => p.startsWith("/espace-client"),
      },
      {
        href: "/terrain",
        label: "Console Web Terrain",
        icon: "touch_app",
        match: (p) => p.startsWith("/terrain"),
      },
    ],
  },
  {
    title: "Opérations",
    items: [
      {
        href: "/operations/planning",
        label: "Planning",
        icon: "calendar_month",
        match: (p) => p.startsWith("/operations/planning"),
      },
      {
        href: "/operations",
        label: "Interventions",
        icon: "local_shipping",
        match: (p) =>
          p.startsWith("/operations") && !p.startsWith("/operations/planning"),
      },
      {
        href: "/recurrences",
        label: "Collectes Récurrentes",
        icon: "update",
        match: (p) => p.startsWith("/recurrences"),
      },
      {
        href: "/tracabilite",
        label: "Traçabilité des déchets",
        icon: "recycling",
        match: (p) => p.startsWith("/tracabilite"),
      },
      {
        href: "/demandes",
        label: "Demandes clients",
        icon: "inbox",
        match: (p) => p.startsWith("/demandes"),
      },
      {
        href: "/import",
        label: "Import Excel",
        icon: "upload_file",
        match: (p) => p.startsWith("/import"),
      },
    ],
  },
  {
    title: "Référentiels & Administration",
    items: [
      {
        href: "/plateforme/entreprise",
        label: "Identité de l'entreprise",
        icon: "domain",
        match: (p) => p.startsWith("/plateforme/entreprise"),
      },
      {
        href: "/clients",
        label: "Clients & Sites",
        icon: "store",
        match: (p) => p.startsWith("/clients"),
      },
      {
        href: "/equipes",
        label: "Équipes & Chauffeurs",
        icon: "groups",
        match: (p) => p.startsWith("/equipes"),
      },
      {
        href: "/vehicules",
        label: "Flotte de véhicules",
        icon: "directions_car",
        match: (p) => p.startsWith("/vehicules"),
      },
      {
        href: "/equipements",
        label: "Équipements & Cuves",
        icon: "oil_barrel",
        match: (p) => p.startsWith("/equipements"),
      },
      {
        href: "/utilisateurs",
        label: "Utilisateurs & Rôles",
        icon: "manage_accounts",
        match: (p) => p.startsWith("/utilisateurs"),
      },
    ],
  },
];

export function navForRole(role: string | null | undefined): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    title: role === "superadmin" && section.title ? "Administration plateforme" : section.title,
    items: section.items.filter((item) => canAccessPath(role, item.href)),
  })).filter((section) => section.items.length > 0);
}
