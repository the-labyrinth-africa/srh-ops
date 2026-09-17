import mongoose, { Schema, models, model } from "mongoose";
import type { RecurrenceFrequency } from "@/types";

export interface IRecurrence {
  _id: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  siteId: mongoose.Types.ObjectId;
  natureIntervention: string;
  frequence: RecurrenceFrequency;
  jourSemaine?: number; // 0 = Dimanche, 1 = Lundi, ...
  jourMois?: number; // 1 - 31
  intervalleJours?: number; // pour personnalisee (ex: tous les 14 jours)
  heurePrevue: string; // "08:00"
  dureeEstimeeMinutes: number;
  equipeId?: mongoose.Types.ObjectId;
  vehiculeId?: mongoose.Types.ObjectId;
  equipementIds: mongoose.Types.ObjectId[];
  informationsParticulieres?: string;
  active: boolean;
  derniereGeneration?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RecurrenceSchema = new Schema<IRecurrence>(
  {
    clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true },
    siteId: { type: Schema.Types.ObjectId, ref: "Site", required: true },
    natureIntervention: { type: String, required: true },
    frequence: {
      type: String,
      enum: ["hebdomadaire", "mensuelle", "personnalisee"],
      required: true,
    },
    jourSemaine: { type: Number, min: 0, max: 6 },
    jourMois: { type: Number, min: 1, max: 31 },
    intervalleJours: { type: Number, min: 1 },
    heurePrevue: { type: String, default: "08:00" },
    dureeEstimeeMinutes: { type: Number, default: 120 },
    equipeId: { type: Schema.Types.ObjectId, ref: "Equipe" },
    vehiculeId: { type: Schema.Types.ObjectId, ref: "Vehicule" },
    equipementIds: [{ type: Schema.Types.ObjectId, ref: "Equipement" }],
    informationsParticulieres: { type: String, default: "" },
    active: { type: Boolean, default: true },
    derniereGeneration: { type: Date },
  },
  { timestamps: true }
);

RecurrenceSchema.index({ clientId: 1 });
RecurrenceSchema.index({ siteId: 1 });
RecurrenceSchema.index({ active: 1 });

export const Recurrence =
  models.Recurrence || model<IRecurrence>("Recurrence", RecurrenceSchema);
