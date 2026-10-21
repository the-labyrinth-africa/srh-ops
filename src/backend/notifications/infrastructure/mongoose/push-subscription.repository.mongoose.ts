import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type { AbonnementPushRepository } from "../../domain/ports";
import { PushSubscriptionModel } from "./push-subscription.model";

export class PushSubscriptionRepositoryMongoose implements AbonnementPushRepository {
  async enregistrer(userId: string, role: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    await connectDB();
    await PushSubscriptionModel.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      { userId, role, endpoint: subscription.endpoint, keys: subscription.keys },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  async retirer(userId: string, endpoint: string) {
    await connectDB();
    await PushSubscriptionModel.deleteOne({ userId, endpoint });
  }

  async lister(roles: string[]) {
    await connectDB();
    const records = await PushSubscriptionModel.find({ role: { $in: roles } }).lean();
    return records.map((record) => ({
      id: String(record._id),
      userId: record.userId,
      role: record.role,
      endpoint: record.endpoint,
      keys: record.keys,
    }));
  }

  async supprimer(id: string) {
    await connectDB();
    await PushSubscriptionModel.deleteOne({ _id: id });
  }
}
