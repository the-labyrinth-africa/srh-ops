import mongoose, { Schema, models, model } from "mongoose";
import type { OperationStatus } from "@/types";

export interface IStatusHistory {
  statut: OperationStatus;
  date: Date;
  parUtilisateur?: mongoose.Types.ObjectId;
  ancienStatut?: OperationStatus;
}

export interface IOperation {
  _id: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  siteId: mongoose.Types.ObjectId;
  natureIntervention: string;
  dateHeurePrevue: Date;
  dureeEstimeeMinutes: number;
  equipeId?: mongoose.Types.ObjectId;
  vehiculeId?: mongoose.Types.ObjectId;
  equipementIds: mongoose.Types.ObjectId[];
  informationsParticulieres: string;
  statut: OperationStatus;
  historiqueStatuts: IStatusHistory[];
  createdAt: Date;
  updatedAt: Date;
}

const StatusHistorySchema = new Schema<IStatusHistory>(
  {
    statut: { type: String, required: true },
    date: { type: Date, default: Date.now },
    parUtilisateur: { type: Schema.Types.ObjectId, ref: "User" },
    ancienStatut: { type: String },
  },
  { _id: false }
);

const OperationSchema = new Schema<IOperation>(
  {
    clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true },
    siteId: { type: Schema.Types.ObjectId, ref: "Site", required: true },
    natureIntervention: { type: String, required: true },
    dateHeurePrevue: { type: Date, required: true },
    dureeEstimeeMinutes: { type: Number, default: 120 },
    equipeId: { type: Schema.Types.ObjectId, ref: "Equipe" },
    vehiculeId: { type: Schema.Types.ObjectId, ref: "Vehicule" },
    equipementIds: [{ type: Schema.Types.ObjectId, ref: "Equipement" }],
    informationsParticulieres: { type: String, default: "" },
    statut: {
      type: String,
      enum: [
        "Planifiée",
        "Affectée",
        "En route",
        "En cours",
        "Terminée",
        "Rapportée",
        "Retardée",
        "Annulée",
      ],
      default: "Planifiée",
    },
    historiqueStatuts: [StatusHistorySchema],
  },
  { timestamps: true }
);

OperationSchema.index({ dateHeurePrevue: 1 });
OperationSchema.index({ statut: 1 });
OperationSchema.index({ clientId: 1 });
OperationSchema.index({ equipeId: 1 });
OperationSchema.index({ vehiculeId: 1 });

export const Operation =
  models.Operation || model<IOperation>("Operation", OperationSchema);
