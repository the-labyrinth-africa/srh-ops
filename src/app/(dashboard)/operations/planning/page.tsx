import { PlanningCalendarClient } from "@/components/operations/PlanningCalendarClient";
import { requirePageAccess } from "@/lib/page-auth";

export default async function PlanningPage() {
  await requirePageAccess("/operations/planning");
  return <PlanningCalendarClient />;
}
