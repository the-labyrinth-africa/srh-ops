import { PageVehicules } from "@/frontend/vehicules";
import { requirePageAccess } from "@/backend/comptes";

export default async function VehiculesPage() {
  await requirePageAccess("/vehicules");
  return <PageVehicules />;
}
