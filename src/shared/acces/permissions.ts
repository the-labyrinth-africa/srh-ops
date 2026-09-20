import type { UserRole } from "@/shared/acces/roles";
import { USER_ROLES } from "@/shared/acces/roles";

export function canWrite(role?: UserRole | string | null): boolean {
  return role === "admin" || role === "dispatcher";
}

export function canManageUsers(role?: UserRole | string | null): boolean {
  return role === "admin";
}

export function isChauffeur(role?: UserRole | string | null): boolean {
  return role === "chauffeur";
}

export function isClientUser(role?: UserRole | string | null): boolean {
  return role === "client";
}

export function canRead(role?: UserRole | string | null): boolean {
  return Boolean(role && (USER_ROLES as string[]).includes(role as string));
}

export function isAdmin(role?: UserRole | string | null): boolean {
  return role === "admin";
}

export function roleLabel(role?: UserRole | string | null): string {
  switch (role) {
    case "admin":
      return "Admin Ops";
    case "dispatcher":
      return "Dispatcher";
    case "chauffeur":
      return "Chauffeur / Terrain";
    case "client":
      return "Espace Client";
    case "lecture":
      return "Lecture seule";
    default:
      return "Utilisateur";
  }
}
