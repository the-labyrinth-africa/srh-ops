import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import { creerCasDUsageClients } from "./application/cas-d-usage-clients";
import { Client as ClientModel } from "./infrastructure/mongoose/client.model";
import { ClientRepositoryMongoose } from "./infrastructure/mongoose/client.repository.mongoose";
import { RattachementsUtilisateursMongoose } from "./infrastructure/mongoose/rattachements-utilisateurs.mongoose";
import { creerCasDUsageSites } from "./application/cas-d-usage-sites";
import type { SiteSaisie } from "./domain/site";
import { Site as SiteModel } from "./infrastructure/mongoose/site.model";
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

/** Identifiant canonique du client, ou null s'il n'existe pas. */
export async function identifiantDuClient(clientId: string): Promise<string | null> {
  await connectDB();
  const client = await ClientModel.findById(clientId);
  return client ? String(client._id) : null;
}

function echapperPourRegex(texte: string): string {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Site du client portant exactement ce nom (espaces autour ignorés, casse ignorée), ou null.
 * La recherche est bornée au client : un site homonyme d'un autre client n'est jamais renvoyé.
 */
export async function trouverSiteDuClientParNom(clientId: string, nom: string): Promise<string | null> {
  await connectDB();
  const site = await SiteModel.findOne({
    clientId,
    nom: { $regex: new RegExp(`^${echapperPourRegex(nom.trim())}$`, "i") },
  });
  return site ? String(site._id) : null;
}

/** Crée un site et renvoie son identifiant. */
export async function creerSite(saisie: SiteSaisie): Promise<string> {
  return (await casDUsageSites.creer(saisie)).id;
}
