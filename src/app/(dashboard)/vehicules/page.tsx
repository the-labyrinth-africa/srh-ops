import { PageVehicules } from "@/frontend/vehicules";
import { requirePageAccess } from "@/lib/page-auth";

export default async function VehiculesPage() {
  await requirePageAccess("/vehicules");
  return <PageVehicules />;
}
