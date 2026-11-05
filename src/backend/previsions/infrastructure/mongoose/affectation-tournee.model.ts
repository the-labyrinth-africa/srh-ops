import mongoose, { Schema, models, model } from "mongoose";

export interface IStationAffectationTournee {
  site: string;
  commune: string;
  siteId?: mongoose.Types.ObjectId;
  clientId?: mongoose.Types.ObjectId;
  quantiteEstimeeLitres: number;
  dureeEstimeeMinutes: number;
  dateHeureArrivee?: Date;
  dateHeureDepart?: Date;
  quantiteCollectee?: number;
}

export interface IAffectationTournee {
  _id?: mongoose.Types.ObjectId;
  date: string;
  tournee: string;
  secteur: string;
  equipeId: mongoose.Types.ObjectId;
  vehiculeId: mongoose.Types.ObjectId;
  volumeEstimeLitres: number;
  dureeEstimeeMinutes: number;
  stations: IStationAffectationTournee[];
  createdAt?: Date;
  updatedAt?: Date;
}

const StationAffectationSchema = new Schema<IStationAffectationTournee>(
  {
    site: { type: String, required: true },
    commune: { type: String, required: true },
    siteId: { type: Schema.Types.ObjectId, ref: "Site" },
    clientId: { type: Schema.Types.ObjectId, ref: "Client" },
    quantiteEstimeeLitres: { type: Number, min: 0, required: true },
    dureeEstimeeMinutes: { type: Number, min: 0, required: true },
    dateHeureArrivee: { type: Date },
    dateHeureDepart: { type: Date },
    quantiteCollectee: { type: Number, min: 0 },
  },
  { _id: false }
);

const AffectationTourneeSchema = new Schema<IAffectationTournee>(
  {
    date: { type: String, required: true },
    tournee: { type: String, required: true },
    secteur: { type: String, required: true },
    equipeId: { type: Schema.Types.ObjectId, ref: "Equipe", required: true },
    vehiculeId: { type: Schema.Types.ObjectId, ref: "Vehicule", required: true },
    volumeEstimeLitres: { type: Number, min: 0, required: true },
    dureeEstimeeMinutes: { type: Number, min: 0, required: true },
    stations: { type: [StationAffectationSchema], required: true },
  },
  { timestamps: true }
);

AffectationTourneeSchema.index({ date: 1, tournee: 1 }, { unique: true });
AffectationTourneeSchema.index({ date: 1, equipeId: 1 });

export const AffectationTournee: mongoose.Model<IAffectationTournee> =
  (models.AffectationTournee as mongoose.Model<IAffectationTournee> | undefined) ||
  model<IAffectationTournee>("AffectationTournee", AffectationTourneeSchema);
