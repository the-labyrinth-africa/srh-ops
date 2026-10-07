import { OperationFormClient } from "@/frontend/operations";
import { requirePageAccess } from "@/backend/comptes";

export default async function NouvelleOperationPage() {
  await requirePageAccess("/operations/nouveau");
  return <OperationFormClient />;
}
