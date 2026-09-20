import { TerrainViewClient } from "@/components/terrain/TerrainViewClient";
import { requirePageAccess } from "@/lib/page-auth";

export default async function TerrainPage() {
  await requirePageAccess("/terrain");
  return <TerrainViewClient />;
}
