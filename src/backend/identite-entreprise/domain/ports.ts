import type { IdentiteEntreprise } from "@/shared/entreprise/identite";
import type { QuantiteUnite } from "@/shared/operations/quantites";

export interface IdentiteEntrepriseRepository {
  obtenir(): Promise<IdentiteEntreprise>;
  obtenirUniteQuantiteGlobale(): Promise<QuantiteUnite | null>;
  enregistrer(identite: IdentiteEntreprise): Promise<IdentiteEntreprise>;
}
