import { OperationFormClient } from "@/components/operations/OperationFormClient";
import { requirePageAccess } from "@/backend/comptes";

export default async function NouvelleOperationPage() {
  await requirePageAccess("/operations/nouveau");
  return <OperationFormClient />;
}
