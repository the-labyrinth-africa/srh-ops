import { OperationsListClient } from "@/components/operations/OperationsListClient";
import { requirePageAccess } from "@/backend/comptes";

export default async function OperationsPage() {
  await requirePageAccess("/operations");
  return <OperationsListClient />;
}
