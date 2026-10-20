import { Schema, model, models } from "mongoose";

interface IInitialisationEntreprise {
  _id: string;
  premierAdminId: string;
  createdAt: Date;
}

const InitialisationEntrepriseSchema = new Schema<IInitialisationEntreprise>(
  {
    _id: { type: String, required: true },
    premierAdminId: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

export const InitialisationEntreprise =
  models.InitialisationEntreprise ||
  model<IInitialisationEntreprise>("InitialisationEntreprise", InitialisationEntrepriseSchema);
