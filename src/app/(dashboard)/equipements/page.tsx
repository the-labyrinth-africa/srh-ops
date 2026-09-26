import { PageEquipements } from "@/frontend/equipements";
import { requirePageAccess } from "@/backend/comptes";

export default async function EquipementsPage() {
  await requirePageAccess("/equipements");
  return <PageEquipements />;
}
