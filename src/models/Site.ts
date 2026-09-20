import mongoose, { Schema, models, model } from "mongoose";

export interface ISite {
  _id: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  nom: string;
  adresse: string;
  localisation?: { lat: number; lng: number };
  typeDechets: string[];
  observations: string;
  createdAt: Date;
  updatedAt: Date;
}

const SiteSchema = new Schema<ISite>(
  {
    clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true },
    nom: { type: String, required: true },
    adresse: { type: String, default: "" },
    localisation: {
      lat: { type: Number },
      lng: { type: Number },
    },
    typeDechets: [{ type: String }],
    observations: { type: String, default: "" },
  },
  { timestamps: true }
);

SiteSchema.index({ clientId: 1 });

export const Site = models.Site || model<ISite>("Site", SiteSchema);
