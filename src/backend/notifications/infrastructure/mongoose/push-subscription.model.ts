import { Schema, model, models } from "mongoose";

export interface IPushSubscription {
  userId: string;
  role: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: Date;
  updatedAt: Date;
}

const PushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    userId: { type: String, required: true, index: true },
    role: { type: String, required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
  },
  { timestamps: true }
);

export const PushSubscriptionModel =
  models.PushSubscription || model<IPushSubscription>("PushSubscription", PushSubscriptionSchema);
