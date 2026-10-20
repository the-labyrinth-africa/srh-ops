import type { IdentiteEntreprise } from "@/shared/entreprise/identite";

export interface IdentiteEntrepriseRepository {
  obtenir(): Promise<IdentiteEntreprise>;
  enregistrer(identite: IdentiteEntreprise): Promise<IdentiteEntreprise>;
}
