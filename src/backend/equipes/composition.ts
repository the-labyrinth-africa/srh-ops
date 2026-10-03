import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import { creerCasDUsageEquipes } from "./application/cas-d-usage";
import { Equipe as EquipeModel } from "./infrastructure/mongoose/equipe.model";
import { EquipeRepositoryMongoose } from "./infrastructure/mongoose/equipe.repository.mongoose";
import { RattachementsUtilisateursMongoose } from "./infrastructure/mongoose/rattachements-utilisateurs.mongoose";

export const casDUsageEquipes = creerCasDUsageEquipes({
  equipes: new EquipeRepositoryMongoose(),
  rattachements: new RattachementsUtilisateursMongoose(),
});

// API publique du domaine pour les autres domaines (ré-exportée par `index.ts`) : une capacité
// ciblée, jamais le modèle Mongoose lui-même.

/** Vrai si une équipe porte cet identifiant. */
export async function existeEquipe(equipeId: string): Promise<boolean> {
  await connectDB();
  return Boolean(await EquipeModel.exists({ _id: equipeId }));
}
