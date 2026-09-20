import type { UserRole } from "@/shared/acces/roles";

/**
 * Matrice d'accès aux pages du tableau de bord : source unique pour la
 * protection des pages serveur, le menu et les tests. Refus par défaut : un
 * chemin absent de la matrice n'est ouvert à personne.
 */
const STAFF: UserRole[] = ["admin", "dispatcher", "lecture"];
const WRITERS: UserRole[] = ["admin", "dispatcher"];
const ALL: UserRole[] = ["admin", "dispatcher", "lecture", "chauffeur", "client"];

interface AccessRule {
  matches: (path: string) => boolean;
  roles: UserRole[];
}

const under = (base: string) => (path: string) => path === base || path.startsWith(`${base}/`);
const OPERATION_DETAIL = /^\/operations\/[a-f\d]{24}$/i;

// L'ordre compte : la première règle qui correspond s'applique.
const RULES: AccessRule[] = [
  { matches: (p) => p === "/", roles: STAFF },
  { matches: under("/utilisateurs"), roles: ["admin"] },
  { matches: under("/import"), roles: WRITERS },
  { matches: under("/operations/nouveau"), roles: WRITERS },
  { matches: (p) => OPERATION_DETAIL.test(p), roles: [...STAFF, "chauffeur"] },
  { matches: under("/operations"), roles: STAFF },
  { matches: under("/recurrences"), roles: STAFF },
  { matches: under("/clients"), roles: STAFF },
  { matches: under("/equipes"), roles: STAFF },
  { matches: under("/vehicules"), roles: STAFF },
  { matches: under("/equipements"), roles: STAFF },
  { matches: under("/terrain"), roles: ["admin", "dispatcher", "chauffeur"] },
  { matches: under("/profil"), roles: ALL },
  { matches: under("/acces-limite"), roles: ["client"] },
];

function normalize(pathname: string): string {
  const withoutQuery = pathname.split("?")[0].split("#")[0];
  const trimmed = withoutQuery.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export function canAccessPath(role: string | null | undefined, pathname: string): boolean {
  if (!role) return false;
  const path = normalize(pathname);
  const rule = RULES.find((r) => r.matches(path));
  return Boolean(rule && (rule.roles as string[]).includes(role));
}

export function homePathFor(role: string | null | undefined): string {
  if (role === "chauffeur") return "/terrain";
  if (role === "client") return "/acces-limite";
  return "/";
}
