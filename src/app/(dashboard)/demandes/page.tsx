import { requirePageAccess } from "@/backend/comptes";
import { DemandeInbox } from "@/frontend/espace-client/composants/DemandeInbox";

export default async function DemandesPage() {
  await requirePageAccess("/demandes");
  return <DemandeInbox />;
}
