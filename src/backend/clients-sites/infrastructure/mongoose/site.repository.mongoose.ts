import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type { Site, SiteSaisie, SiteAvecClientPeuple } from "../../domain/site";
import type { SiteRepository } from "../../domain/ports";
import { Site as SiteModel } from "./site.model";

interface DocumentSite {
  _id: unknown;
  clientId: unknown; // ObjectId brut (écriture) ou { _id, nom } (lecture, après .populate)
  nom: string;
  adresse?: string;
  localisation?: { lat: number; lng: number };
  typeDechets?: string[];
  observations?: string;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

function estPeuple(clientId: unknown): clientId is { _id: unknown; nom: string } {
  return Boolean(clientId) && typeof clientId === "object" && "nom" in (clientId as object);
}

function versEntitePeuplee(doc: DocumentSite): SiteAvecClientPeuple {
  return {
    id: String(doc._id),
    clientId: estPeuple(doc.clientId) ? { id: String(doc.clientId._id), nom: doc.clientId.nom } : String(doc.clientId),
    nom: doc.nom,
    adresse: doc.adresse ?? "",
    localisation: doc.localisation,
    typeDechets: doc.typeDechets ?? [],
    observations: doc.observations ?? "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    revision: doc.__v,
  };
}

function versEntite(doc: DocumentSite): Site {
  return {
    id: String(doc._id),
    clientId: estPeuple(doc.clientId) ? String(doc.clientId._id) : String(doc.clientId),
    nom: doc.nom,
    adresse: doc.adresse ?? "",
    localisation: doc.localisation,
    typeDechets: doc.typeDechets ?? [],
    observations: doc.observations ?? "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    revision: doc.__v,
  };
}

export class SiteRepositoryMongoose implements SiteRepository {
  async lister(clientId?: string): Promise<SiteAvecClientPeuple[]> {
    await connectDB();
    const filtre = clientId ? { clientId } : {};
    const docs = (await SiteModel.find(filtre)
      .populate("clientId", "nom")
      .sort({ nom: 1 })
      .lean()) as DocumentSite[];
    return docs.map(versEntitePeuplee);
  }

  async trouverParId(id: string): Promise<SiteAvecClientPeuple | null> {
    await connectDB();
    const doc = (await SiteModel.findById(id).populate("clientId", "nom").lean()) as DocumentSite | null;
    return doc ? versEntitePeuplee(doc) : null;
  }

  async creer(saisie: SiteSaisie): Promise<Site> {
    await connectDB();
    const doc = await SiteModel.create(saisie);
    return versEntite(doc.toObject() as DocumentSite);
  }

  async modifier(id: string, saisie: SiteSaisie): Promise<Site | null> {
    await connectDB();
    const doc = (await SiteModel.findByIdAndUpdate(id, saisie, { new: true }).lean()) as DocumentSite | null;
    return doc ? versEntite(doc) : null;
  }

  async supprimer(id: string): Promise<boolean> {
    await connectDB();
    return Boolean(await SiteModel.findByIdAndDelete(id));
  }
}
