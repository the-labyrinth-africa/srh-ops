import type { UserRole } from "@/types";

export function canWrite(role?: UserRole | string | null): boolean {
  return role === "admin" || role === "dispatcher";
}

export function canRead(role?: UserRole | string | null): boolean {
  return role === "admin" || role === "dispatcher" || role === "lecture";
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
    case "lecture":
      return "Lecture seule";
    default:
      return "Utilisateur";
  }
}
