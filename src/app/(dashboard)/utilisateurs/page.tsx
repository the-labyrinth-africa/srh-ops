import { UsersListClient } from "@/components/users/UsersListClient";
import { requirePageAccess } from "@/backend/comptes";

export default async function UtilisateursPage() {
  await requirePageAccess("/utilisateurs");
  return <UsersListClient />;
}
