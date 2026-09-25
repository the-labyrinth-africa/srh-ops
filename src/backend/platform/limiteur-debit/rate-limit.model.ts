import { Schema, models, model } from "mongoose";

export interface IRateLimit {
  key: string;
  count: number;
  expiresAt: Date;
}

const RateLimitSchema = new Schema<IRateLimit>({
  key: { type: String, required: true, unique: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
});

// Suppression automatique des fenêtres échues.
RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimit = models.RateLimit || model<IRateLimit>("RateLimit", RateLimitSchema);
