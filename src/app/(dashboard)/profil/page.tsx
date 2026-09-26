import { ProfilPageClient } from "@/components/profil/ProfilPageClient";
import { requirePageAccess } from "@/backend/comptes";

export default async function ProfilPage() {
  await requirePageAccess("/profil");
  return <ProfilPageClient />;
}
