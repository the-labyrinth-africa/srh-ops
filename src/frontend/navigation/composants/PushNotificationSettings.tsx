"use client";

import { useEffect, useState } from "react";

function decodeKey(value: string): Uint8Array {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sauvegarder(subscription: PushSubscription, method: "POST" | "DELETE") {
  const response = await fetch("/api/push/subscriptions", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(method === "POST" ? subscription.toJSON() : { endpoint: subscription.endpoint }),
  });
  if (!response.ok) throw new Error((await response.json()).error || "Impossible de modifier l’abonnement push.");
}

export function PushNotificationSettings() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    setSupported(true);
    navigator.serviceWorker.register("/push-sw.js", { scope: "/" })
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setEnabled(Boolean(subscription)))
      .catch(() => setMessage("Les notifications push ne sont pas disponibles sur cet appareil."));
  }, []);

  async function modifierAbonnement() {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await sauvegarder(existing, "DELETE");
        await existing.unsubscribe();
        setEnabled(false);
        setMessage("Notifications désactivées.");
      } else {
        const keyResponse = await fetch("/api/push/public-key", { cache: "no-store" });
        const { publicKey, error } = await keyResponse.json();
        if (!keyResponse.ok) throw new Error(error || "Configuration push indisponible.");
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeKey(publicKey) as BufferSource,
        });
        await sauvegarder(subscription, "POST");
        setEnabled(true);
        setMessage("Notifications activées sur cet appareil.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de modifier l’abonnement push.");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return <p className="mt-3 text-sm text-on-surface-variant">Les notifications push ne sont pas prises en charge par ce navigateur.</p>;

  return (
    <div className="mt-3 border-t border-surface-container-high pt-3">
      <button
        type="button"
        disabled={busy}
        onClick={modifierAbonnement}
        className="min-h-11 w-full rounded-xl bg-primary px-3 py-2 text-left text-sm font-semibold text-on-primary disabled:opacity-60"
      >
        {busy ? "Mise à jour…" : enabled ? "Désactiver sur cet appareil" : "Activer sur cet appareil"}
      </button>
      {message && <p role="status" className="mt-2 text-sm text-on-surface-variant">{message}</p>}
    </div>
  );
}
