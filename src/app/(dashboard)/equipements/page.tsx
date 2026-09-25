import { PageEquipements } from "@/frontend/equipements";
import { requirePageAccess } from "@/lib/page-auth";

export default async function EquipementsPage() {
  await requirePageAccess("/equipements");
  return <PageEquipements />;
}
