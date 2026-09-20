import { ReferentialPage } from "@/components/referentials/ReferentialPage";
import { requirePageAccess } from "@/lib/page-auth";

export default async function EquipesPage() {
  await requirePageAccess("/equipes");
  return (
    <ReferentialPage
      title="Équipes & Chauffeurs"
      subtitle="Gestion des équipes terrain et de leur disponibilité."
      icon="groups"
      apiPath="/api/equipes"
      fields={[
        { key: "nom", label: "Nom de l'équipe", required: true },
        { key: "membres", label: "Membres (séparés par virgule)", table: false },
        { key: "disponibilite", label: "Disponibilité", type: "checkbox" },
      ]}
      emptyForm={{ nom: "", membres: "", disponibilite: true }}
    />
  );
}
