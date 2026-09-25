import { creerCasDUsageClients } from "./application/cas-d-usage-clients";
import { ClientRepositoryMongoose } from "./infrastructure/mongoose/client.repository.mongoose";
import { RattachementsUtilisateursMongoose } from "./infrastructure/mongoose/rattachements-utilisateurs.mongoose";
import { creerCasDUsageSites } from "./application/cas-d-usage-sites";
import { SiteRepositoryMongoose } from "./infrastructure/mongoose/site.repository.mongoose";

const rattachements = new RattachementsUtilisateursMongoose();

export const casDUsageClients = creerCasDUsageClients({ clients: new ClientRepositoryMongoose(), rattachements });

export const casDUsageSites = creerCasDUsageSites({ sites: new SiteRepositoryMongoose() });
