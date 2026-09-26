import { ClientsPageClient } from "@/frontend/clients-sites";
import { requirePageAccess } from "@/backend/comptes";

export default async function ClientsPage() {
  await requirePageAccess("/clients");
  return <ClientsPageClient />;
}
