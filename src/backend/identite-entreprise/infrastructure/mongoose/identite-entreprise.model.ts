import mongoose, { Schema, models, model } from "mongoose";

export interface IIdentiteEntrepriseModel {
  _id: mongoose.Types.ObjectId;
  cle: string;
  nomEntreprise: string;
  sigle: string;
  siteWeb: string;
  logoMimeType?: "image/png";
  logoBase64?: string;
  createdAt: Date;
  updatedAt: Date;
}

const IdentiteEntrepriseSchema = new Schema<IIdentiteEntrepriseModel>(
  {
    cle: { type: String, required: true, unique: true, default: "principale" },
    nomEntreprise: { type: String, required: true, trim: true },
    sigle: { type: String, required: true, trim: true },
    siteWeb: { type: String, default: "" },
    logoMimeType: { type: String, enum: ["image/png"] },
    logoBase64: { type: String },
  },
  { timestamps: true, collection: "identite_entreprise" }
);

export const IdentiteEntrepriseModel =
  models.IdentiteEntreprise ||
  model<IIdentiteEntrepriseModel>("IdentiteEntreprise", IdentiteEntrepriseSchema);
