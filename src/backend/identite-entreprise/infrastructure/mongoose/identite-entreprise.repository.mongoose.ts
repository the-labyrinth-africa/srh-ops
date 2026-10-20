import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import {
  IDENTITE_ENTREPRISE_PAR_DEFAUT,
  type IdentiteEntreprise,
} from "@/shared/entreprise/identite";
import { IdentiteEntrepriseModel } from "./identite-entreprise.model";
import type { IdentiteEntrepriseRepository } from "../../domain/ports";

interface IdentiteDocument {
  nomEntreprise: string;
  sigle: string;
  siteWeb: string;
  logoMimeType?: "image/png";
  logoBase64?: string;
}

function versIdentite(document: IdentiteDocument): IdentiteEntreprise {
  return {
    nomEntreprise: document.nomEntreprise,
    sigle: document.sigle,
    siteWeb: document.siteWeb,
    logoDataUrl:
      document.logoMimeType === "image/png" && document.logoBase64
        ? `data:image/png;base64,${document.logoBase64}`
        : null,
  };
}

export class IdentiteEntrepriseRepositoryMongoose implements IdentiteEntrepriseRepository {
  async obtenir(): Promise<IdentiteEntreprise> {
    await connectDB();
    const document = (await IdentiteEntrepriseModel.findOne({ cle: "principale" })
      .select("-_id nomEntreprise sigle siteWeb logoMimeType logoBase64")
      .lean()) as IdentiteDocument | null;
    return document ? versIdentite(document) : IDENTITE_ENTREPRISE_PAR_DEFAUT;
  }

  async enregistrer(identite: IdentiteEntreprise): Promise<IdentiteEntreprise> {
    await connectDB();
    const logoBase64 = identite.logoDataUrl?.split(",")[1];
    const update = {
      $set: {
        nomEntreprise: identite.nomEntreprise,
        sigle: identite.sigle,
        siteWeb: identite.siteWeb,
        ...(logoBase64 ? { logoMimeType: "image/png", logoBase64 } : {}),
      },
      ...(logoBase64 ? {} : { $unset: { logoMimeType: 1, logoBase64: 1 } }),
      $setOnInsert: { cle: "principale" },
    };
    const document = (await IdentiteEntrepriseModel.findOneAndUpdate(
      { cle: "principale" },
      update,
      { new: true, upsert: true, runValidators: true }
    )
      .select("-_id nomEntreprise sigle siteWeb logoMimeType logoBase64")
      .lean()) as IdentiteDocument | null;

    if (!document) {
      throw new Error("L'identité de l'entreprise n'a pas pu être enregistrée.");
    }
    return versIdentite(document);
  }
}
