import { requirePageAccess } from "@/backend/comptes";
import { GuideUtilisation } from "@/frontend/guide/GuideUtilisation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Guide d'utilisation | WOM",
  description: "Guide de prise en main de WOM, adapté au rôle de l'utilisateur connecté.",
};

export default async function GuidePage() {
  const session = await requirePageAccess("/guide");
  return <GuideUtilisation role={session.user.role} />;
}
