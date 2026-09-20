import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type { Vehicule, VehiculeSaisie } from "../../domain/vehicule";
import type { VehiculeRepository } from "../../domain/ports";
import { Vehicule as VehiculeModel } from "./vehicule.model";

interface DocumentVehicule {
  _id: unknown;
  identification: string;
  type?: string;
  capacite?: number;
  disponibilite: boolean;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

function versEntite(doc: DocumentVehicule): Vehicule {
  return {
    id: String(doc._id),
    identification: doc.identification,
    type: doc.type ?? "",
    capacite: doc.capacite ?? 0,
    disponibilite: doc.disponibilite,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    revision: doc.__v,
  };
}

export class VehiculeRepositoryMongoose implements VehiculeRepository {
  async lister(): Promise<Vehicule[]> {
    await connectDB();
    const docs = (await VehiculeModel.find().sort({ identification: 1 }).lean()) as DocumentVehicule[];
    return docs.map(versEntite);
  }

  async trouverParId(id: string): Promise<Vehicule | null> {
    await connectDB();
    const doc = (await VehiculeModel.findById(id).lean()) as DocumentVehicule | null;
    return doc ? versEntite(doc) : null;
  }

  async creer(saisie: VehiculeSaisie): Promise<Vehicule> {
    await connectDB();
    const doc = await VehiculeModel.create(saisie);
    return versEntite(doc.toObject() as DocumentVehicule);
  }

  async modifier(id: string, saisie: VehiculeSaisie): Promise<Vehicule | null> {
    await connectDB();
    const doc = (await VehiculeModel.findByIdAndUpdate(id, saisie, { new: true }).lean()) as DocumentVehicule | null;
    return doc ? versEntite(doc) : null;
  }

  async supprimer(id: string): Promise<boolean> {
    await connectDB();
    return Boolean(await VehiculeModel.findByIdAndDelete(id));
  }
}
