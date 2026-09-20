import { ImportPageClient } from "@/components/import/ImportPageClient";
import { requirePageAccess } from "@/lib/page-auth";

export default async function ImportPage() {
  await requirePageAccess("/import");
  return <ImportPageClient />;
}