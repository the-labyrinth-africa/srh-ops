import mongoose, { Schema, models, model } from "mongoose";

export interface IPasswordResetToken {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  purpose: "reset" | "invitation";
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

const PasswordResetTokenSchema = new Schema<IPasswordResetToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    purpose: { type: String, enum: ["reset", "invitation"], required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Purge automatique 24 h après l'expiration (les jetons utilisés restent visibles jusque-là).
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86_400 });

export const PasswordResetToken =
  models.PasswordResetToken || model<IPasswordResetToken>("PasswordResetToken", PasswordResetTokenSchema);
