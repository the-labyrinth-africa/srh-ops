import type { Metadata } from "next";
import { DemandePubliqueForm } from "@/frontend/espace-client";

export const metadata: Metadata = {
  title: "Demander une collecte | WOM",
  description: "Transmettez une demande de collecte à votre équipe pour vérification.",
};

export default function DemandePage() {
  return <DemandePubliqueForm />;
}
