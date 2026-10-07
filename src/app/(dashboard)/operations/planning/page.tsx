import { PlanningCalendarClient } from "@/frontend/operations";
import { requirePageAccess } from "@/backend/comptes";

export default async function PlanningPage() {
  await requirePageAccess("/operations/planning");
  return <PlanningCalendarClient />;
}
