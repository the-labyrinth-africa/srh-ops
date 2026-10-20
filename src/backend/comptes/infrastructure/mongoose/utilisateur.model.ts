import mongoose, { Schema, models, model } from "mongoose";
import type { UserRole } from "@/shared/acces/roles";

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
  platformSuperadmin?: boolean;
  premierAdminEntreprise?: boolean;
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
      enum: ["admin", "dispatcher", "chauffeur", "client", "lecture", "superadmin"],
      default: "dispatcher",
    },
    clientId: { type: Schema.Types.ObjectId, ref: "Client" },
    equipeId: { type: Schema.Types.ObjectId, ref: "Equipe" },
    telephone: { type: String, default: "" },
    mustChangePassword: { type: Boolean, default: false },
    passwordChangedAt: { type: Date },
    platformSuperadmin: { type: Boolean, select: false },
    premierAdminEntreprise: { type: Boolean, select: false },
  },
  { timestamps: true }
);

UserSchema.index({ role: 1 });
UserSchema.index(
  { platformSuperadmin: 1 },
  {
    unique: true,
    partialFilterExpression: { platformSuperadmin: true },
    name: "unique_platform_superadmin",
  }
);
UserSchema.index(
  { premierAdminEntreprise: 1 },
  {
    unique: true,
    partialFilterExpression: { premierAdminEntreprise: true },
    name: "unique_premier_admin_entreprise",
  }
);

export const User = models.User || model<IUserModel>("User", UserSchema);
