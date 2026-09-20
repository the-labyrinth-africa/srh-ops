import { OperationFormClient } from "@/components/operations/OperationFormClient";
import { requirePageAccess } from "@/lib/page-auth";

export default async function NouvelleOperationPage() {
  await requirePageAccess("/operations/nouveau");
  return <OperationFormClient />;
}
