import { creerCasDUsageEquipes } from "./application/cas-d-usage";
import { EquipeRepositoryMongoose } from "./infrastructure/mongoose/equipe.repository.mongoose";
import { RattachementsUtilisateursMongoose } from "./infrastructure/mongoose/rattachements-utilisateurs.mongoose";

export const casDUsageEquipes = creerCasDUsageEquipes({
  equipes: new EquipeRepositoryMongoose(),
  rattachements: new RattachementsUtilisateursMongoose(),
});
