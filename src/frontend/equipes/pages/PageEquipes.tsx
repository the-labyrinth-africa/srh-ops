import { PageReferentiel } from "@/frontend/design-system/PageReferentiel";
import { CHEMIN_API_EQUIPES } from "../api/chemins";

export function PageEquipes() {
  return (
    <PageReferentiel
      title="Équipes & Chauffeurs"
      subtitle="Gestion des équipes terrain et de leur disponibilité."
      icon="groups"
      apiPath={CHEMIN_API_EQUIPES}
      fields={[
        { key: "nom", label: "Nom de l'équipe", required: true },
        { key: "membres", label: "Membres (séparés par virgule)", table: false },
        { key: "disponibilite", label: "Disponibilité", type: "checkbox" },
      ]}
      emptyForm={{ nom: "", membres: "", disponibilite: true }}
    />
  );
}
