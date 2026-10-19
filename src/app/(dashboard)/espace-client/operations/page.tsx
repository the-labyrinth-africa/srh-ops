import { requirePageAccess } from "@/backend/comptes";
import { ClientOperations } from "@/frontend/espace-client";

export default async function EspaceClientOperationsPage() {
  await requirePageAccess("/espace-client/operations");
  return <ClientOperations />;
}
