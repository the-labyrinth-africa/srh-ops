import { creerCasDUsageIdentiteEntreprise } from "./application/cas-d-usage";
import { IdentiteEntrepriseRepositoryMongoose } from "./infrastructure/mongoose/identite-entreprise.repository.mongoose";

const casDUsage = creerCasDUsageIdentiteEntreprise(new IdentiteEntrepriseRepositoryMongoose());

export const obtenirIdentiteEntreprise = casDUsage.obtenir;
export const obtenirUniteQuantiteGlobale = casDUsage.obtenirUniteQuantiteGlobale;
export const enregistrerIdentiteEntreprise = casDUsage.enregistrer;
