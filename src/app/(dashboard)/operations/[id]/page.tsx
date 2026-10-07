import { OperationDetailClient } from "@/frontend/operations";
import { requirePageAccess } from "@/backend/comptes";

export default async function OperationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePageAccess(`/operations/${id}`);
  return <OperationDetailClient id={id} />;
}
