import { ClientsPageClient } from "@/components/clients/ClientsPageClient";
import { requirePageAccess } from "@/lib/page-auth";

export default async function ClientsPage() {
  await requirePageAccess("/clients");
  return <ClientsPageClient />;
}
