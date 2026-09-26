import { PlanningCalendarClient } from "@/components/operations/PlanningCalendarClient";
import { requirePageAccess } from "@/backend/comptes";

export default async function PlanningPage() {
  await requirePageAccess("/operations/planning");
  return <PlanningCalendarClient />;
}
