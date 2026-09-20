import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type { Equipement, EquipementSaisie } from "../../domain/equipement";
import type { EquipementRepository } from "../../domain/ports";
import { Equipement as EquipementModel } from "./equipement.model";

interface DocumentEquipement {
  _id: unknown;
  nom: string;
  type?: string;
  disponibilite: boolean;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

function versEntite(doc: DocumentEquipement): Equipement {
  return {
    id: String(doc._id),
    nom: doc.nom,
    type: doc.type ?? "",
    disponibilite: doc.disponibilite,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    revision: doc.__v,
  };
}

export class EquipementRepositoryMongoose implements EquipementRepository {
  async lister(): Promise<Equipement[]> {
    await connectDB();
    const docs = (await EquipementModel.find().sort({ nom: 1 }).lean()) as DocumentEquipement[];
    return docs.map(versEntite);
  }

  async trouverParId(id: string): Promise<Equipement | null> {
    await connectDB();
    const doc = (await EquipementModel.findById(id).lean()) as DocumentEquipement | null;
    return doc ? versEntite(doc) : null;
  }

  async creer(saisie: EquipementSaisie): Promise<Equipement> {
    await connectDB();
    const doc = await EquipementModel.create(saisie);
    return versEntite(doc.toObject() as DocumentEquipement);
  }

  async modifier(id: string, saisie: EquipementSaisie): Promise<Equipement | null> {
    await connectDB();
    const doc = (await EquipementModel.findByIdAndUpdate(id, saisie, { new: true }).lean()) as DocumentEquipement | null;
    return doc ? versEntite(doc) : null;
  }

  async supprimer(id: string): Promise<boolean> {
    await connectDB();
    return Boolean(await EquipementModel.findByIdAndDelete(id));
  }
}
