import { requirePageAccess } from "@/backend/comptes";
import { TracabiliteDashboard } from "@/frontend/tracabilite";

export default async function TracabilitePage() {
  await requirePageAccess("/tracabilite");
  return <TracabiliteDashboard />;
}
