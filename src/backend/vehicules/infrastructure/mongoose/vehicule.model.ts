import mongoose, { Schema, models, model } from "mongoose";

export interface IVehicule {
  _id: mongoose.Types.ObjectId;
  identification: string;
  type: string;
  capacite: number;
  disponibilite: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VehiculeSchema = new Schema<IVehicule>(
  {
    identification: { type: String, required: true, unique: true },
    type: { type: String, default: "" },
    capacite: { type: Number, default: 0 },
    disponibilite: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Vehicule =
  models.Vehicule || model<IVehicule>("Vehicule", VehiculeSchema);
