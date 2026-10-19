import type { Metadata } from "next";
import { DemandePubliqueForm } from "@/frontend/espace-client";

export const metadata: Metadata = {
  title: "Demander une collecte | SRH Ops",
  description: "Transmettez une demande de collecte à l'équipe SRH pour vérification.",
};

export default function DemandePage() {
  return <DemandePubliqueForm />;
}
