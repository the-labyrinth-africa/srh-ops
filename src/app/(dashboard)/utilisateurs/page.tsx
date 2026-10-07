import { UsersListClient } from "@/frontend/comptes";
import { requirePageAccess } from "@/backend/comptes";

export default async function UtilisateursPage() {
  await requirePageAccess("/utilisateurs");
  return <UsersListClient />;
}
