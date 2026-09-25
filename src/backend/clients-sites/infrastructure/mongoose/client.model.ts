import mongoose, { Schema, models, model } from "mongoose";

export interface IClient {
  _id: mongoose.Types.ObjectId;
  nom: string;
  contact: { telephone: string; email: string };
  createdAt: Date;
  updatedAt: Date;
}

const ClientSchema = new Schema<IClient>(
  {
    nom: { type: String, required: true },
    contact: {
      telephone: { type: String, default: "" },
      email: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

export const Client = models.Client || model<IClient>("Client", ClientSchema);
