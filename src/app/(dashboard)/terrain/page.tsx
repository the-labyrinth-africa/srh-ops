import { TerrainViewClient } from "@/components/terrain/TerrainViewClient";
import { requirePageAccess } from "@/backend/comptes";

export default async function TerrainPage() {
  await requirePageAccess("/terrain");
  return <TerrainViewClient />;
}
