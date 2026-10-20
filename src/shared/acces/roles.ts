export const TENANT_ROLES = [
  "admin",
  "dispatcher",
  "chauffeur",
  "client",
  "lecture",
] as const;

export type TenantRole = (typeof TENANT_ROLES)[number];
export type UserRole = TenantRole | "superadmin";

export const USER_ROLES: UserRole[] = [...TENANT_ROLES, "superadmin"];
