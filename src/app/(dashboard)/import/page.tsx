import { ImportPageClient } from "@/frontend/import-donnees";
import { requirePageAccess } from "@/backend/comptes";

export default async function ImportPage() {
  await requirePageAccess("/import");
  return <ImportPageClient />;
}