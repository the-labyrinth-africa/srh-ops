import { PageReferentiel } from "@/frontend/design-system/PageReferentiel";
import { CHEMIN_API_VEHICULES } from "../api/chemins";

export function PageVehicules() {
  return (
    <PageReferentiel
      title="Flotte de véhicules"
      subtitle="Suivi de la flotte et disponibilité des véhicules."
      icon="directions_car"
      apiPath={CHEMIN_API_VEHICULES}
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
