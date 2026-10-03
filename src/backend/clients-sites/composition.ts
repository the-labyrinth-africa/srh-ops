import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import { creerCasDUsageClients } from "./application/cas-d-usage-clients";
import { Client as ClientModel } from "./infrastructure/mongoose/client.model";
import { ClientRepositoryMongoose } from "./infrastructure/mongoose/client.repository.mongoose";
import { RattachementsUtilisateursMongoose } from "./infrastructure/mongoose/rattachements-utilisateurs.mongoose";
import { creerCasDUsageSites } from "./application/cas-d-usage-sites";
import { SiteRepositoryMongoose } from "./infrastructure/mongoose/site.repository.mongoose";

const rattachements = new RattachementsUtilisateursMongoose();

export const casDUsageClients = creerCasDUsageClients({ clients: new ClientRepositoryMongoose(), rattachements });

export const casDUsageSites = creerCasDUsageSites({ sites: new SiteRepositoryMongoose() });

// API publique du domaine pour les autres domaines (ré-exportée par `index.ts`) : une capacité
// ciblée, jamais le modèle Mongoose lui-même.

/** Vrai si un client porte cet identifiant. */
export async function existeClient(clientId: string): Promise<boolean> {
  await connectDB();
  return Boolean(await ClientModel.exists({ _id: clientId }));
}
