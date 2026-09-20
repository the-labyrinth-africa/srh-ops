import { ReferentialPage } from "@/components/referentials/ReferentialPage";
import { requirePageAccess } from "@/lib/page-auth";

export default async function EquipementsPage() {
  await requirePageAccess("/equipements");
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
