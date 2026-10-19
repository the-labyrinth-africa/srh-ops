import { requirePageAccess } from "@/backend/comptes";
import { ClientDashboard } from "@/frontend/espace-client";

export default async function EspaceClientPage() {
  await requirePageAccess("/espace-client");
  return <ClientDashboard />;
}
