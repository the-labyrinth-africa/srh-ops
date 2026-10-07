import { OperationsListClient } from "@/frontend/operations";
import { requirePageAccess } from "@/backend/comptes";

export default async function OperationsPage() {
  await requirePageAccess("/operations");
  return <OperationsListClient />;
}
