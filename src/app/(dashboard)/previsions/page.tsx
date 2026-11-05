import { PrevisionsCollectesPage } from "@/frontend/previsions";
import { requirePageAccess } from "@/backend/comptes";

export default async function PagePrevisions() {
  const session = await requirePageAccess("/previsions");
  const peutConfigurer = session.user.role === "admin" || session.user.role === "dispatcher";
  return <PrevisionsCollectesPage peutConfigurer={peutConfigurer} />;
}
