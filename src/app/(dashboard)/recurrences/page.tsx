import { RecurrencesListClient } from "@/components/recurrences/RecurrencesListClient";
import { requirePageAccess } from "@/lib/page-auth";

export default async function RecurrencesPage() {
  await requirePageAccess("/recurrences");
  return <RecurrencesListClient />;
}
