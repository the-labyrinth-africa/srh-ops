import { PageReferentiel } from "@/frontend/design-system/PageReferentiel";
import { CHEMIN_API_EQUIPEMENTS } from "../api/chemins";

export function PageEquipements() {
  return (
    <PageReferentiel
      title="Équipements & Cuves"
      subtitle="Inventaire des équipements de collecte et cuves."
      icon="oil_barrel"
      apiPath={CHEMIN_API_EQUIPEMENTS}
      fields={[
        { key: "nom", label: "Nom", required: true },
        { key: "type", label: "Type" },
        { key: "disponibilite", label: "Disponibilité", type: "checkbox" },
      ]}
      emptyForm={{ nom: "", type: "", disponibilite: true }}
    />
  );
}
