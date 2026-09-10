import mongoose, { Schema, models, model } from "mongoose";

export interface IEquipe {
  _id: mongoose.Types.ObjectId;
  nom: string;
  membres: string[];
  disponibilite: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EquipeSchema = new Schema<IEquipe>(
  {
    nom: { type: String, required: true },
    membres: [{ type: String }],
    disponibilite: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Equipe = models.Equipe || model<IEquipe>("Equipe", EquipeSchema);
