import mongoose, { Schema, models, model } from "mongoose";
import type { StatutDemandePublique } from "../../domain/demande";

export interface IDemandePublique {
  _id: mongoose.Types.ObjectId;
  nomClient: string;
  nomContact: string;
  email: string;
  telephone: string;
  nomSite: string;
  adresseSite: string;
  natureIntervention: string;
  dateSouhaitee: Date;
  informationsParticulieres: string;
  statut: StatutDemandePublique;
  operationId?: mongoose.Types.ObjectId;
  clientId?: mongoose.Types.ObjectId;
  siteId?: mongoose.Types.ObjectId;
  traiteePar?: mongoose.Types.ObjectId;
  traiteeLe?: Date;
  motifRefus?: string;
  conversionCommenceeLe?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DemandePubliqueSchema = new Schema<IDemandePublique>(
  {
    nomClient: { type: String, required: true, trim: true, maxlength: 120 },
    nomContact: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    telephone: { type: String, default: "", trim: true, maxlength: 40 },
    nomSite: { type: String, required: true, trim: true, maxlength: 120 },
    adresseSite: { type: String, required: true, trim: true, maxlength: 250 },
    natureIntervention: { type: String, required: true, trim: true, maxlength: 150 },
    dateSouhaitee: { type: Date, required: true },
    informationsParticulieres: { type: String, default: "", maxlength: 2000 },
    statut: {
      type: String,
      enum: ["en_attente", "conversion_en_cours", "convertie", "refusee"],
      required: true,
      default: "en_attente",
    },
    operationId: { type: Schema.Types.ObjectId, ref: "Operation" },
    clientId: { type: Schema.Types.ObjectId, ref: "Client" },
    siteId: { type: Schema.Types.ObjectId, ref: "Site" },
    traiteePar: { type: Schema.Types.ObjectId, ref: "User" },
    traiteeLe: { type: Date },
    motifRefus: { type: String, default: "", maxlength: 500 },
    conversionCommenceeLe: { type: Date },
  },
  { timestamps: true }
);

DemandePubliqueSchema.index({ statut: 1, createdAt: -1 });

export const DemandePubliqueModel =
  models.DemandePublique || model<IDemandePublique>("DemandePublique", DemandePubliqueSchema);
