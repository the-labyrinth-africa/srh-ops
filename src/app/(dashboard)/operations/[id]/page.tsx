import { OperationDetailClient } from "@/components/operations/OperationDetailClient";
import { requirePageAccess } from "@/lib/page-auth";

export default async function OperationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePageAccess(`/operations/${id}`);
  return <OperationDetailClient id={id} />;
}
