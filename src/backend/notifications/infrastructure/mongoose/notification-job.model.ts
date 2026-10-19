import mongoose, { Schema, models, model } from "mongoose";

export interface INotificationJob {
  _id: mongoose.Types.ObjectId;
  key: string;
  to: string;
  subject: string;
  text: string;
  status: "pending" | "processing" | "sent" | "failed";
  attempts: number;
  nextAttemptAt: Date;
  lockedAt?: Date;
  lastError?: string;
  sentAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationJobSchema = new Schema<INotificationJob>(
  {
    key: { type: String, required: true, unique: true },
    to: { type: String, required: true },
    subject: { type: String, required: true },
    text: { type: String, required: true },
    status: { type: String, enum: ["pending", "processing", "sent", "failed"], default: "pending" },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    lockedAt: { type: Date },
    lastError: { type: String },
    sentAt: { type: Date },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

NotificationJobSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });
NotificationJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const NotificationJobModel =
  models.NotificationJob || model<INotificationJob>("NotificationJob", NotificationJobSchema);
