import { PageReferentiel } from "@/frontend/design-system/PageReferentiel";
import { requirePageAccess } from "@/lib/page-auth";

export default async function VehiculesPage() {
  await requirePageAccess("/vehicules");
  return (
    <PageReferentiel
      title="Flotte de véhicules"
      subtitle="Suivi de la flotte et disponibilité des véhicules."
      icon="directions_car"
      apiPath="/api/vehicules"
      fields={[
        { key: "identification", label: "Immatriculation", required: true },
        { key: "type", label: "Type" },
        { key: "capacite", label: "Capacité (L)", type: "number" },
        { key: "disponibilite", label: "Disponibilité", type: "checkbox" },
      ]}
      emptyForm={{ identification: "", type: "", capacite: "0", disponibilite: true }}
    />
  );
}
