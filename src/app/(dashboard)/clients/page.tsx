import { ClientsPageClient } from "@/frontend/clients-sites";
import { requirePageAccess } from "@/lib/page-auth";

export default async function ClientsPage() {
  await requirePageAccess("/clients");
  return <ClientsPageClient />;
}
