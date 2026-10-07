import { RecurrencesListClient } from "@/frontend/recurrences";
import { requirePageAccess } from "@/backend/comptes";

export default async function RecurrencesPage() {
  await requirePageAccess("/recurrences");
  return <RecurrencesListClient />;
}
