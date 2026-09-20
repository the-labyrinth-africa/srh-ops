import { ProfilPageClient } from "@/components/profil/ProfilPageClient";
import { requirePageAccess } from "@/lib/page-auth";

export default async function ProfilPage() {
  await requirePageAccess("/profil");
  return <ProfilPageClient />;
}
