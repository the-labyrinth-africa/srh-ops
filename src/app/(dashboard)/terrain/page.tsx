import { TerrainViewClient } from "@/frontend/terrain";
import { requirePageAccess } from "@/backend/comptes";

export default async function TerrainPage() {
  await requirePageAccess("/terrain");
  return <TerrainViewClient />;
}
