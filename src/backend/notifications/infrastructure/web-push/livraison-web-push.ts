import webpush, { type PushSubscription } from "web-push";
import type { AbonnementPush, MessagePush } from "../../domain/push";
import type { LivraisonPush } from "../../domain/ports";

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

export class LivraisonWebPush implements LivraisonPush {
  clePublique(): string | null {
    return process.env.VAPID_PUBLIC_KEY ?? null;
  }

  estConfiguree(): boolean {
    return configureVapid();
  }

  async envoyer(abonnement: AbonnementPush, message: MessagePush): Promise<void> {
    const notification = {
      title: message.title,
      body: message.body,
      url: message.url ?? "/terrain",
      ...(message.tag ? { tag: message.tag } : {}),
    };
    await webpush.sendNotification(
      { endpoint: abonnement.endpoint, keys: abonnement.keys } as PushSubscription,
      JSON.stringify(notification)
    );
  }
}
