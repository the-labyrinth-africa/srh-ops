import { PageEquipes } from "@/frontend/equipes";
import { requirePageAccess } from "@/backend/comptes";

export default async function EquipesPage() {
  await requirePageAccess("/equipes");
  return <PageEquipes />;
}
