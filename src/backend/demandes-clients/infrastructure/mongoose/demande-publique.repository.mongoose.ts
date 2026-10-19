import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type {
  DemandePublique,
  DemandePubliqueSaisie,
  QualificationDemande,
} from "../../domain/demande";
import type { DemandesPubliquesRepository } from "../../domain/ports";
import { DemandePubliqueModel, type IDemandePublique } from "./demande-publique.model";

const CONVERSION_EXPIRATION_MS = 15 * 60_000;

function versEntite(doc: IDemandePublique): DemandePublique {
  const demande: DemandePublique = {
    id: String(doc._id),
    nomClient: doc.nomClient,
    nomContact: doc.nomContact,
    email: doc.email,
    telephone: doc.telephone ?? "",
    nomSite: doc.nomSite,
    adresseSite: doc.adresseSite,
    natureIntervention: doc.natureIntervention,
    dateSouhaitee: doc.dateSouhaitee,
    informationsParticulieres: doc.informationsParticulieres ?? "",
    statut: doc.statut,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
  if (doc.operationId) demande.operationId = String(doc.operationId);
  if (doc.clientId) demande.clientId = String(doc.clientId);
  if (doc.siteId) demande.siteId = String(doc.siteId);
  if (doc.traiteePar) demande.traiteePar = String(doc.traiteePar);
  if (doc.traiteeLe) demande.traiteeLe = doc.traiteeLe;
  if (doc.motifRefus) demande.motifRefus = doc.motifRefus;
  if (doc.conversionCommenceeLe) demande.conversionCommenceeLe = doc.conversionCommenceeLe;
  return demande;
}

export class DemandesPubliquesRepositoryMongoose implements DemandesPubliquesRepository {
  async creer(saisie: DemandePubliqueSaisie, maintenant: Date): Promise<DemandePublique> {
    await connectDB();
    const doc = await DemandePubliqueModel.create({ ...saisie, statut: "en_attente", createdAt: maintenant });
    return versEntite(doc.toObject());
  }

  async lister(): Promise<DemandePublique[]> {
    await connectDB();
    const docs = await DemandePubliqueModel.find()
      .sort({ createdAt: -1 })
      .lean<IDemandePublique[]>();
    return docs.map(versEntite);
  }

  async trouverParId(id: string): Promise<DemandePublique | null> {
    await connectDB();
    const doc = await DemandePubliqueModel.findById(id).lean<IDemandePublique>();
    return doc ? versEntite(doc) : null;
  }

  async acquerirConversion(id: string, maintenant: Date): Promise<DemandePublique | null> {
    await connectDB();
    const expiration = new Date(maintenant.getTime() - CONVERSION_EXPIRATION_MS);
    const doc = await DemandePubliqueModel.findOneAndUpdate(
      {
        _id: id,
        $or: [
          { statut: "en_attente" },
          { statut: "conversion_en_cours", conversionCommenceeLe: { $lt: expiration } },
        ],
      },
      { $set: { statut: "conversion_en_cours", conversionCommenceeLe: maintenant } },
      { new: true }
    ).lean<IDemandePublique>();
    return doc ? versEntite(doc) : null;
  }

  async marquerConvertie(
    id: string,
    qualification: QualificationDemande,
    operationId: string,
    utilisateurId: string,
    maintenant: Date
  ): Promise<boolean> {
    await connectDB();
    const resultat = await DemandePubliqueModel.updateOne(
      { _id: id, statut: "conversion_en_cours" },
      {
        $set: {
          statut: "convertie",
          clientId: qualification.clientId,
          siteId: qualification.siteId,
          operationId,
          traiteePar: utilisateurId,
          traiteeLe: maintenant,
        },
        $unset: { conversionCommenceeLe: 1 },
      }
    );
    return resultat.modifiedCount === 1;
  }

  async libererConversion(id: string): Promise<void> {
    await connectDB();
    await DemandePubliqueModel.updateOne(
      { _id: id, statut: "conversion_en_cours" },
      { $set: { statut: "en_attente" }, $unset: { conversionCommenceeLe: 1 } }
    );
  }

  async refuser(id: string, utilisateurId: string, motif: string, maintenant: Date): Promise<boolean> {
    await connectDB();
    const resultat = await DemandePubliqueModel.updateOne(
      { _id: id, statut: "en_attente" },
      {
        $set: {
          statut: "refusee",
          motifRefus: motif,
          traiteePar: utilisateurId,
          traiteeLe: maintenant,
        },
      }
    );
    return resultat.modifiedCount === 1;
  }
}
