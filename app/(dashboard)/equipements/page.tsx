import { ReferentialPage } from "@/components/referentials/ReferentialPage";

export default function EquipementsPage() {
  return (
    <ReferentialPage
      title="Équipements & Cuves"
      subtitle="Inventaire des équipements de collecte et cuves."
      icon="oil_barrel"
      apiPath="/api/equipements"
      fields={[
        { key: "nom", label: "Nom", required: true },
        { key: "type", label: "Type" },
        { key: "disponibilite", label: "Disponibilité", type: "checkbox" },
      ]}
      emptyForm={{ nom: "", type: "", disponibilite: true }}
    />
  );
}
