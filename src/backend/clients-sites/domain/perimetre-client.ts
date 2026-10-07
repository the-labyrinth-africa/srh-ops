import type { UserRole } from "@/shared/acces/roles";
import { isClientUser } from "@/shared/acces/permissions";

export function estDansPerimetreClient(
  role: UserRole,
  clientIdCompte: string | undefined,
  clientIdDocument: string | null | undefined
): boolean {
  if (!isClientUser(role)) return true;
  if (!clientIdCompte) return false;
  return clientIdDocument === clientIdCompte;
}