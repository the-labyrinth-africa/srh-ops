import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type { Client, ClientSaisie } from "../../domain/client";
import type { ClientRepository } from "../../domain/ports";
import { Client as ClientModel } from "./client.model";

interface DocumentClient {
  _id: unknown;
  nom: string;
  contact: { telephone: string; email: string };
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

function versEntite(doc: DocumentClient): Client {
  return {
    id: String(doc._id),
    nom: doc.nom,
    contact: { telephone: doc.contact?.telephone ?? "", email: doc.contact?.email ?? "" },
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    revision: doc.__v,
  };
}

export class ClientRepositoryMongoose implements ClientRepository {
  async lister(idClient?: string): Promise<Client[]> {
    await connectDB();
    const filtre = idClient ? { _id: idClient } : {};
    const docs = (await ClientModel.find(filtre).sort({ nom: 1 }).lean()) as DocumentClient[];
    return docs.map(versEntite);
  }

  async trouverParId(id: string): Promise<Client | null> {
    await connectDB();
    const doc = (await ClientModel.findById(id).lean()) as DocumentClient | null;
    return doc ? versEntite(doc) : null;
  }

  async creer(saisie: ClientSaisie): Promise<Client> {
    await connectDB();
    const doc = await ClientModel.create(saisie);
    return versEntite(doc.toObject() as DocumentClient);
  }

  async modifier(id: string, saisie: ClientSaisie): Promise<Client | null> {
    await connectDB();
    const doc = (await ClientModel.findByIdAndUpdate(id, saisie, { new: true }).lean()) as DocumentClient | null;
    return doc ? versEntite(doc) : null;
  }

  async supprimer(id: string): Promise<boolean> {
    await connectDB();
    return Boolean(await ClientModel.findByIdAndDelete(id));
  }
}
