import { PageEquipes } from "@/frontend/equipes";
import { requirePageAccess } from "@/lib/page-auth";

export default async function EquipesPage() {
  await requirePageAccess("/equipes");
  return <PageEquipes />;
}
