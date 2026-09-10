import mongoose, { Schema, models, model } from "mongoose";
import type { UserRole } from "@/types";

export interface IUser {
  _id: mongoose.Types.ObjectId;
  nom: string;
  email: string;
  motDePasseHash: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    nom: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    motDePasseHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["admin", "dispatcher", "lecture"],
      default: "dispatcher",
    },
  },
  { timestamps: true }
);

export const User = models.User || model<IUser>("User", UserSchema);
