import { OperationDetailClient } from "@/components/operations/OperationDetailClient";

export default async function OperationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OperationDetailClient id={id} />;
}
