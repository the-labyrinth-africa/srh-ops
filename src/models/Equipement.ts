import mongoose, { Schema, models, model } from "mongoose";

export interface IEquipement {
  _id: mongoose.Types.ObjectId;
  nom: string;
  type: string;
  disponibilite: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EquipementSchema = new Schema<IEquipement>(
  {
    nom: { type: String, required: true },
    type: { type: String, default: "" },
    disponibilite: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Equipement =
  models.Equipement || model<IEquipement>("Equipement", EquipementSchema);
