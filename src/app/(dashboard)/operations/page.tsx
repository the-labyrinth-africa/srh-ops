import { OperationsListClient } from "@/components/operations/OperationsListClient";
import { requirePageAccess } from "@/lib/page-auth";

export default async function OperationsPage() {
  await requirePageAccess("/operations");
  return <OperationsListClient />;
}
