import webpush, { type PushSubscription } from "web-push";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import { PushSubscriptionModel } from "../infrastructure/mongoose/push-subscription.model";

let vapidConfigured = false;

function configureVapid(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
  }
  return true;
}

export function clePubliquePush(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export async function enregistrerAbonnementPush(userId: string, role: string, subscription: PushSubscription) {
  await connectDB();
  await PushSubscriptionModel.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    { userId, role, endpoint: subscription.endpoint, keys: subscription.keys },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

export async function retirerAbonnementPush(userId: string, endpoint: string) {
  await connectDB();
  await PushSubscriptionModel.deleteOne({ userId, endpoint });
}

export async function envoyerPushAuxAbonnes(payload: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  roles?: string[];
}) {
  if (!configureVapid()) return;
  await connectDB();
  const subscriptions = await PushSubscriptionModel.find({ role: { $in: payload.roles ?? ["admin", "dispatcher"] } }).lean();
  const notification = {
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/terrain",
    ...(payload.tag ? { tag: payload.tag } : {}),
  };
  await Promise.all(subscriptions.map(async (record) => {
    try {
      await webpush.sendNotification(
        { endpoint: record.endpoint, keys: record.keys } as PushSubscription,
        JSON.stringify(notification)
      );
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await PushSubscriptionModel.deleteOne({ _id: record._id });
      } else {
        console.error("[web-push] Livraison impossible.", statusCode ?? "erreur réseau");
      }
    }
  }));
}
