import mongoose, { Schema, model, models } from "mongoose";
import { QUANTITE_UNITES } from "@/shared/operations/quantites";

export interface ITraceabilite {
  _id: mongoose.Types.ObjectId;
  operationId: mongoose.Types.ObjectId;
  identifiantSuivi: string;
  typeDechet: string;
  volume: number;
  unite: string;
  traitement: string;
  creePar: mongoose.Types.ObjectId;
  modifiePar: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TraceabiliteSchema = new Schema<ITraceabilite>(
  {
    operationId: {
      type: Schema.Types.ObjectId,
      ref: "Operation",
      required: true,
    },
    identifiantSuivi: { type: String, required: true, trim: true },
    typeDechet: { type: String, required: true, trim: true },
    volume: { type: Number, required: true, min: 0 },
    unite: { type: String, enum: QUANTITE_UNITES, required: true },
    traitement: { type: String, required: true, trim: true },
    creePar: { type: Schema.Types.ObjectId, ref: "User", required: true },
    modifiePar: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

TraceabiliteSchema.index({ identifiantSuivi: 1 }, { unique: true });
TraceabiliteSchema.index({ operationId: 1, createdAt: -1 });

export const TraceabiliteModel =
  models.Traceabilite || model<ITraceabilite>("Traceabilite", TraceabiliteSchema);
