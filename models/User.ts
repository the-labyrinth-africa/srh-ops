import mongoose, { Schema, models, model } from "mongoose";
import type { UserRole } from "@/types";

export interface IUserModel {
  _id: mongoose.Types.ObjectId;
  username: string;
  nom: string;
  email: string;
  motDePasseHash: string;
  role: UserRole;
  clientId?: mongoose.Types.ObjectId;
  equipeId?: mongoose.Types.ObjectId;
  telephone?: string;
  mustChangePassword?: boolean;
  /** Date de la dernière réinitialisation (lien ou administrateur) ; jamais posée par un changement volontaire. */
  passwordChangedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUserModel>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    nom: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    motDePasseHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["admin", "dispatcher", "chauffeur", "client", "lecture"],
      default: "dispatcher",
    },
    clientId: { type: Schema.Types.ObjectId, ref: "Client" },
    equipeId: { type: Schema.Types.ObjectId, ref: "Equipe" },
    telephone: { type: String, default: "" },
    mustChangePassword: { type: Boolean, default: false },
    passwordChangedAt: { type: Date },
  },
  { timestamps: true }
);

UserSchema.index({ role: 1 });

export const User = models.User || model<IUserModel>("User", UserSchema);
