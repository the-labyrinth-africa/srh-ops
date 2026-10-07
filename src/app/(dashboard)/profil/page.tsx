import { ProfilPageClient } from "@/frontend/comptes";
import { requirePageAccess } from "@/backend/comptes";

export default async function ProfilPage() {
  await requirePageAccess("/profil");
  return <ProfilPageClient />;
}
