import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type { Equipe, EquipeSaisie } from "../../domain/equipe";
import type { EquipeRepository } from "../../domain/ports";
import { Equipe as EquipeModel } from "./equipe.model";

interface DocumentEquipe {
  _id: unknown;
  nom: string;
  membres?: string[];
  disponibilite: boolean;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

function versEntite(doc: DocumentEquipe): Equipe {
  return {
    id: String(doc._id),
    nom: doc.nom,
    membres: doc.membres ?? [],
    disponibilite: doc.disponibilite,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    revision: doc.__v,
  };
}

export class EquipeRepositoryMongoose implements EquipeRepository {
  async lister(): Promise<Equipe[]> {
    await connectDB();
    const docs = (await EquipeModel.find().sort({ nom: 1 }).lean()) as DocumentEquipe[];
    return docs.map(versEntite);
  }

  async trouverParId(id: string): Promise<Equipe | null> {
    await connectDB();
    const doc = (await EquipeModel.findById(id).lean()) as DocumentEquipe | null;
    return doc ? versEntite(doc) : null;
  }

  async creer(saisie: EquipeSaisie): Promise<Equipe> {
    await connectDB();
    const doc = await EquipeModel.create(saisie);
    return versEntite(doc.toObject() as DocumentEquipe);
  }

  async modifier(id: string, saisie: EquipeSaisie): Promise<Equipe | null> {
    await connectDB();
    const doc = (await EquipeModel.findByIdAndUpdate(id, saisie, { new: true }).lean()) as DocumentEquipe | null;
    return doc ? versEntite(doc) : null;
  }

  async supprimer(id: string): Promise<boolean> {
    await connectDB();
    const doc = await EquipeModel.findByIdAndDelete(id);
    return Boolean(doc);
  }
}
