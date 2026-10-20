import { requirePageAccess } from "@/backend/comptes";
import { IdentiteEntreprisePage, PremierAdminEntreprise } from "@/frontend/plateforme";

export default async function IdentiteEntrepriseRoute() {
  await requirePageAccess("/plateforme/entreprise");
  return (
    <div className="space-y-4">
      <PremierAdminEntreprise />
      <IdentiteEntreprisePage />
    </div>
  );
}
