import { RecurrencesListClient } from "@/components/recurrences/RecurrencesListClient";
import { requirePageAccess } from "@/backend/comptes";

export default async function RecurrencesPage() {
  await requirePageAccess("/recurrences");
  return <RecurrencesListClient />;
}
