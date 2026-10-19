import { requirePageAccess } from "@/backend/comptes";
import { redirect } from "next/navigation";

export default async function AccesLimitePage() {
  await requirePageAccess("/acces-limite");
  redirect("/espace-client");
}
