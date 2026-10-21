import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { GET as lireClePublique } from "@/app/api/push/public-key/route";
import { POST as creerAbonnement, DELETE as supprimerAbonnement } from "@/app/api/push/subscriptions/route";
import { PushSubscriptionModel } from "@/backend/notifications/infrastructure/mongoose/push-subscription.model";

const ID = "507f1f77bcf86cd799439011";
const endpoint = "https://push.example.test/subscription-1";
const subscription = { endpoint, keys: { p256dh: "public-key", auth: "auth-key" } };
const previousPublicKey = process.env.VAPID_PUBLIC_KEY;

function connecter(connecte = true) {
  vi.mocked(nextAuth.getServerSession).mockResolvedValue(
    connecte
      ? ({
          user: { id: ID, name: "Admin Ops", email: "admin@example.test", role: "admin", mustChangePassword: false },
        } as never)
      : null
  );
}

function requete(method: "POST" | "DELETE", body: unknown) {
  return new NextRequest("http://localhost:3000/api/push/subscriptions", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API d'abonnement push", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    delete process.env.VAPID_PUBLIC_KEY;
    connecter();
    await PushSubscriptionModel.init();
  });

  afterEach(() => {
    if (previousPublicKey === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = previousPublicKey;
  });

  it("protège la clé publique et renvoie 503 si VAPID n'est pas configuré", async () => {
    const unavailable = await lireClePublique();
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ error: "Notifications push non configurées." });

    connecter(false);
    expect((await lireClePublique()).status).toBe(401);

    connecter();
    process.env.VAPID_PUBLIC_KEY = "public-vapid-key";
    const available = await lireClePublique();
    expect(available.status).toBe(200);
    expect(await available.json()).toEqual({ publicKey: "public-vapid-key" });
    expect(available.headers.get("Cache-Control")).toBe("no-store");
  });

  it("valide et persiste l'abonnement, puis le supprime pour cet utilisateur", async () => {
    const created = await creerAbonnement(requete("POST", subscription));
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ subscribed: true });
    expect(await PushSubscriptionModel.findOne({ endpoint }).lean()).toMatchObject({
      userId: ID,
      role: "admin",
      keys: subscription.keys,
    });

    const removed = await supprimerAbonnement(requete("DELETE", { endpoint }));
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ subscribed: false });
    expect(await PushSubscriptionModel.countDocuments()).toBe(0);
  });

  it("refuse un endpoint HTTP ou un abonnement incomplet", async () => {
    const insecure = await creerAbonnement(requete("POST", { ...subscription, endpoint: "http://push.example.test" }));
    const incomplete = await creerAbonnement(requete("POST", { endpoint, keys: { p256dh: "" } }));
    expect(insecure.status).toBe(400);
    expect(incomplete.status).toBe(400);
    expect(await PushSubscriptionModel.countDocuments()).toBe(0);
  });
});
