import type { IdentiteEntreprise } from "@/shared/entreprise/identite";
import type { IdentiteEntrepriseRepository } from "../domain/ports";

export function creerCasDUsageIdentiteEntreprise(repository: IdentiteEntrepriseRepository) {
  return {
    obtenir: () => repository.obtenir(),
    enregistrer: (identite: IdentiteEntreprise) => repository.enregistrer(identite),
  };
}
