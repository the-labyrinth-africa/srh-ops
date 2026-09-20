import { UsersListClient } from "@/components/users/UsersListClient";
import { requirePageAccess } from "@/lib/page-auth";

export default async function UtilisateursPage() {
  await requirePageAccess("/utilisateurs");
  return <UsersListClient />;
}
