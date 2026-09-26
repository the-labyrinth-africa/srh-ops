import { ImportPageClient } from "@/components/import/ImportPageClient";
import { requirePageAccess } from "@/backend/comptes";

export default async function ImportPage() {
  await requirePageAccess("/import");
  return <ImportPageClient />;
}