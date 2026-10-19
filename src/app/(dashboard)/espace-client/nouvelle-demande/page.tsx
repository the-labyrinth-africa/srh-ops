import { requirePageAccess } from "@/backend/comptes";
import { ClientRequestForm } from "@/frontend/espace-client";

export default async function NouvelleDemandeClientPage() {
  await requirePageAccess("/espace-client/nouvelle-demande");
  return <ClientRequestForm />;
}
